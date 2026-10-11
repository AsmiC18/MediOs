import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Patient, PatientPortalAccountStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../auth/refresh-token.util';
import { resolveRefreshExpiresAt } from '../../auth/auth-token.config';
import {
  assertPatientEligibleForPortal,
  assertPortalAccountActive,
} from '../portal-patient-access.util';

export type CreatedPatientPortalSession = {
  sessionId: string;
  familyId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export type RotatedPatientPortalSession = CreatedPatientPortalSession & {
  patient: Patient;
};

export class PortalRefreshReuseDetectedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly familyId: string,
    readonly patientId: string,
    readonly hospitalId: string,
    readonly branchId: string | null,
  ) {
    super('Refresh token reuse detected');
    this.name = 'PortalRefreshReuseDetectedError';
  }
}

@Injectable()
export class PatientPortalSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSessionForPatient(patient: Patient): Promise<CreatedPatientPortalSession> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const familyId = randomUUID();
    const refreshExpiresAt = resolveRefreshExpiresAt();

    const session = await this.prisma.patientPortalSession.create({
      data: {
        patientId: patient.id,
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        refreshTokenHash,
        expiresAt: refreshExpiresAt,
        familyId,
      },
    });

    return {
      sessionId: session.id,
      familyId,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async rotateRefreshToken(refreshToken: string): Promise<RotatedPatientPortalSession> {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const existing = await this.prisma.patientPortalSession.findUnique({
      where: { refreshTokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.revokeActiveSessionsInFamily(existing.familyId, 'reuse_detected');
      throw new PortalRefreshReuseDetectedError(
        existing.id,
        existing.familyId,
        existing.patientId,
        existing.hospitalId,
        existing.branchId,
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    const refreshExpiresAt = resolveRefreshExpiresAt();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "PatientPortalSession"
        WHERE "id" = ${existing.id}
        FOR UPDATE
      `;

      const rotated = await tx.patientPortalSession.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: 'rotation',
          lastUsedAt: now,
        },
      });

      if (rotated.count === 0) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const patient = await tx.patient.findUnique({
        where: { id: existing.patientId },
        include: { portalAccount: true },
      });

      if (!patient || patient.hospitalId !== existing.hospitalId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      assertPatientEligibleForPortal(patient);
      if (!patient.portalAccount) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      assertPortalAccountActive(patient.portalAccount.status);

      const newSession = await tx.patientPortalSession.create({
        data: {
          patientId: patient.id,
          hospitalId: patient.hospitalId,
          branchId: patient.branchId,
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: refreshExpiresAt,
          familyId: existing.familyId,
        },
      });

      await tx.patientPortalSession.update({
        where: { id: existing.id },
        data: { replacedBySessionId: newSession.id },
      });

      return {
        sessionId: newSession.id,
        familyId: existing.familyId,
        refreshToken: newRefreshToken,
        refreshExpiresAt,
        patient,
      };
    });
  }

  async revokeSessionForLogout(
    refreshToken: string,
    patientId: string,
    hospitalId: string,
  ): Promise<{ sessionId: string; familyId: string; branchId: string | null } | null> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.patientPortalSession.findUnique({
      where: { refreshTokenHash },
    });

    if (!session) {
      return null;
    }

    if (session.patientId !== patientId || session.hospitalId !== hospitalId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      return {
        sessionId: session.id,
        familyId: session.familyId,
        branchId: session.branchId,
      };
    }

    const now = new Date();
    await this.prisma.patientPortalSession.update({
      where: { id: session.id },
      data: {
        revokedAt: now,
        revokeReason: 'logout',
        lastUsedAt: now,
      },
    });

    return {
      sessionId: session.id,
      familyId: session.familyId,
      branchId: session.branchId,
    };
  }

  async revokeActiveSessionsInFamily(familyId: string, revokeReason: string): Promise<void> {
    const now = new Date();
    await this.prisma.patientPortalSession.updateMany({
      where: { familyId, revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason,
        lastUsedAt: now,
      },
    });
  }
}
