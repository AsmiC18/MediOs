import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { resolveRefreshExpiresAt } from './auth-token.config';
import {
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.util';

export type UserWithRole = User & {
  role: { name: string };
};

export type CreatedAuthSession = {
  sessionId: string;
  familyId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export type RotatedAuthSession = CreatedAuthSession & {
  user: UserWithRole;
};

export class RefreshReuseDetectedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly familyId: string,
    readonly userId: string,
    readonly hospitalId: string,
    readonly branchId: string | null,
  ) {
    super('Refresh token reuse detected');
    this.name = 'RefreshReuseDetectedError';
  }
}

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSessionForUser(user: UserWithRole): Promise<CreatedAuthSession> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const familyId = randomUUID();
    const refreshExpiresAt = resolveRefreshExpiresAt();

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        hospitalId: user.hospitalId,
        branchId: user.branchId,
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

  async rotateRefreshToken(refreshToken: string): Promise<RotatedAuthSession> {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const existing = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.revokeActiveSessionsInFamily(existing.familyId, 'reuse_detected');
      throw new RefreshReuseDetectedError(
        existing.id,
        existing.familyId,
        existing.userId,
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "AuthSession"
          WHERE "id" = ${existing.id}
          FOR UPDATE
        `;

        const rotated = await tx.authSession.updateMany({
          where: {
            id: existing.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokeReason: 'rotation',
            lastUsedAt: now,
          },
        });

        if (rotated.count === 0) {
          throw new UnauthorizedException('Invalid refresh token');
        }

        const newSession = await tx.authSession.create({
          data: {
            userId: existing.userId,
            hospitalId: existing.hospitalId,
            branchId: existing.branchId,
            refreshTokenHash: newRefreshTokenHash,
            expiresAt: refreshExpiresAt,
            familyId: existing.familyId,
          },
        });

        await tx.authSession.update({
          where: { id: existing.id },
          data: { replacedBySessionId: newSession.id },
        });

        const user = await tx.user.findUnique({
          where: { id: existing.userId },
          include: { role: true },
        });

        if (!user) {
          throw new UnauthorizedException('Invalid refresh token');
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new UnauthorizedException('User is not active');
        }

        if (existing.hospitalId !== user.hospitalId) {
          throw new UnauthorizedException('Invalid refresh token');
        }

        await tx.authSession.update({
          where: { id: newSession.id },
          data: {
            branchId: user.branchId,
            hospitalId: user.hospitalId,
          },
        });

        return {
          sessionId: newSession.id,
          familyId: existing.familyId,
          refreshToken: newRefreshToken,
          refreshExpiresAt,
          user,
        };
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof RefreshReuseDetectedError) {
        throw error;
      }
      throw error;
    }
  }

  async revokeSessionForLogout(
    refreshToken: string,
    userId: string,
    hospitalId: string,
  ): Promise<{ sessionId: string; familyId: string; branchId: string | null } | null> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
    });

    if (!session) {
      return null;
    }

    if (session.userId !== userId || session.hospitalId !== hospitalId) {
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
    await this.prisma.authSession.update({
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

  async revokeActiveSessionsInFamily(
    familyId: string,
    revokeReason: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason,
        lastUsedAt: now,
      },
    });
  }

}
