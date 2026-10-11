import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PatientPortalAccountStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { resolveJwtAccessTtlSeconds } from '../../auth/auth-token.config';
import { canonicalizePatientPhone } from '../../common/utils/phone.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PATIENT_PORTAL_ACTIVATED,
  PATIENT_PORTAL_LOGIN_FAILED,
  PATIENT_PORTAL_LOGIN_SUCCEEDED,
  PATIENT_PORTAL_LOGOUT,
} from '../portal-audit.actions';
import { PORTAL_INVALID_CREDENTIALS_MESSAGE } from '../portal-auth.constants';
import {
  assertPatientEligibleForPortal,
  assertPortalAccountActive,
} from '../portal-patient-access.util';
import { PATIENT_PRINCIPAL_TYPE, PatientPrincipal } from '../portal.types';
import { PortalActivateDto } from './dto/portal-activate.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { PortalLoginRateLimitService } from './portal-login-rate-limit.service';
import {
  PatientPortalSessionService,
  PortalRefreshReuseDetectedError,
} from './patient-portal-session.service';

@Injectable()
export class PatientPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly portalLoginRateLimit: PortalLoginRateLimitService,
    private readonly portalSessionService: PatientPortalSessionService,
  ) {}

  private async signAccessToken(patient: {
    id: string;
    hospitalId: string;
    branchId: string | null;
  }): Promise<string> {
    return this.jwtService.signAsync({
      principalType: PATIENT_PRINCIPAL_TYPE,
      sub: patient.id,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
    });
  }

  private buildAuthResponse(
    patient: { id: string; hospitalId: string; branchId: string | null },
    refreshToken: string,
    refreshExpiresAt: Date,
    accessToken: string,
  ) {
    return {
      accessToken,
      refreshToken,
      expiresIn: resolveJwtAccessTtlSeconds(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      patient: {
        id: patient.id,
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
      },
    };
  }

  async activate(dto: PortalActivateDto) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { code: dto.hospitalCode.trim() },
    });
    if (!hospital) {
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    let phone: string;
    try {
      phone = canonicalizePatientPhone(dto.phone);
    } catch {
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    const patient = await this.prisma.patient.findUnique({
      where: { hospitalId_phone: { hospitalId: hospital.id, phone } },
    });

    if (!patient) {
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    try {
      assertPatientEligibleForPortal(patient);
    } catch {
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    const existing = await this.prisma.patientPortalAccount.findUnique({
      where: { patientId: patient.id },
    });
    if (existing) {
      throw new ConflictException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();

    await this.prisma.patientPortalAccount.create({
      data: {
        patientId: patient.id,
        hospitalId: hospital.id,
        passwordHash,
        status: PatientPortalAccountStatus.ACTIVE,
        activatedAt: now,
      },
    });

    await this.auditService.log({
      action: PATIENT_PORTAL_ACTIVATED,
      entity: 'PatientPortalAccount',
      entityId: patient.id,
      hospitalId: hospital.id,
      branchId: patient.branchId,
      metadata: { patientId: patient.id },
    });

    return { activated: true };
  }

  async login(dto: PortalLoginDto) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { code: dto.hospitalCode.trim() },
    });
    if (!hospital) {
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    let phone: string;
    try {
      phone = canonicalizePatientPhone(dto.phone);
    } catch {
      await this.recordLoginFailed(hospital.id, dto.phone, 'invalid_phone');
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    await this.portalLoginRateLimit.assertAllowed(hospital.id, phone);

    const patient = await this.prisma.patient.findUnique({
      where: { hospitalId_phone: { hospitalId: hospital.id, phone } },
      include: { portalAccount: true },
    });

    if (!patient?.portalAccount) {
      await this.recordLoginFailed(hospital.id, phone, 'no_account');
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    try {
      assertPatientEligibleForPortal(patient);
      assertPortalAccountActive(patient.portalAccount.status);
    } catch {
      await this.recordLoginFailed(hospital.id, phone, 'patient_ineligible');
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      patient.portalAccount.passwordHash,
    );
    if (!passwordMatches) {
      await this.recordLoginFailed(hospital.id, phone, 'invalid_credentials');
      throw new UnauthorizedException(PORTAL_INVALID_CREDENTIALS_MESSAGE);
    }

    await this.portalLoginRateLimit.clearAttempts(hospital.id, phone);

    const session = await this.portalSessionService.createSessionForPatient(patient);
    const accessToken = await this.signAccessToken(patient);
    const response = this.buildAuthResponse(
      patient,
      session.refreshToken,
      session.refreshExpiresAt,
      accessToken,
    );

    await this.auditService.log({
      action: PATIENT_PORTAL_LOGIN_SUCCEEDED,
      entity: 'PatientPortalSession',
      entityId: session.sessionId,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
      metadata: { patientId: patient.id, familyId: session.familyId },
    });

    return response;
  }

  async refresh(refreshToken: string) {
    try {
      const rotated =
        await this.portalSessionService.rotateRefreshToken(refreshToken);
      const accessToken = await this.signAccessToken(rotated.patient);
      return this.buildAuthResponse(
        rotated.patient,
        rotated.refreshToken,
        rotated.refreshExpiresAt,
        accessToken,
      );
    } catch (error) {
      if (error instanceof PortalRefreshReuseDetectedError) {
        await this.auditService.log({
          action: PATIENT_PORTAL_LOGIN_FAILED,
          entity: 'PatientPortalSession',
          entityId: error.sessionId,
          hospitalId: error.hospitalId,
          branchId: error.branchId,
          metadata: { reason: 'refresh_reuse_detected', patientId: error.patientId },
        });
      }
      throw error;
    }
  }

  async logout(refreshToken: string, principal: PatientPrincipal) {
    const result = await this.portalSessionService.revokeSessionForLogout(
      refreshToken,
      principal.patientId,
      principal.hospitalId,
    );

    if (result) {
      await this.auditService.log({
        action: PATIENT_PORTAL_LOGOUT,
        entity: 'PatientPortalSession',
        entityId: result.sessionId,
        hospitalId: principal.hospitalId,
        branchId: result.branchId,
        metadata: { patientId: principal.patientId, familyId: result.familyId },
      });
    }

    return { loggedOut: true };
  }

  private async recordLoginFailed(
    hospitalId: string,
    phone: string,
    reason: string,
  ) {
    try {
      const normalized = canonicalizePatientPhone(phone);
      await this.portalLoginRateLimit.recordFailedAttempt(hospitalId, normalized);
    } catch {
      await this.portalLoginRateLimit.recordFailedAttempt(hospitalId, phone.trim());
    }

    await this.auditService.log({
      action: PATIENT_PORTAL_LOGIN_FAILED,
      entity: 'PatientPortalAccount',
      hospitalId,
      metadata: { reason },
    });
  }
}
