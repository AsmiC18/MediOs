import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { parseBooleanEnv, isProduction } from '../common/config/app-environment';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AUTH_LOGIN_FAILED,
  AUTH_LOGIN_SUCCEEDED,
  AUTH_LOGOUT,
  AUTH_REFRESH_FAILED,
  AUTH_REFRESH_REUSE_DETECTED,
  AUTH_REFRESH_SUCCEEDED,
} from './auth-audit.actions';
import {
  AuthSessionService,
  RefreshReuseDetectedError,
  UserWithRole,
} from './auth-session.service';
import {
  resolveJwtAccessTtlSeconds,
} from './auth-token.config';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginRateLimitService } from './login-rate-limit.service';
import { hashRefreshToken } from './refresh-token.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly loginRateLimitService: LoginRateLimitService,
    private readonly auditService: AuditService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  private isPublicRegistrationEnabled(): boolean {
    return parseBooleanEnv(process.env.AUTH_PUBLIC_REGISTRATION_ENABLED, !isProduction());
  }

  private getRegistrationBootstrapSecret(): string | null {
    const value = process.env.AUTH_REGISTRATION_BOOTSTRAP_SECRET?.trim();
    return value || null;
  }

  private assertRegistrationAllowed(
    bootstrapSecret?: string,
  ): void {
    const expectedBootstrap = this.getRegistrationBootstrapSecret();
    const bootstrapMatches =
      !!expectedBootstrap &&
      !!bootstrapSecret?.trim() &&
      bootstrapSecret.trim() === expectedBootstrap;

    if (isProduction()) {
      if (!bootstrapMatches) {
        throw new ForbiddenException('Registration is disabled');
      }
      return;
    }

    if (!this.isPublicRegistrationEnabled() && !bootstrapMatches) {
      throw new ForbiddenException('Registration is disabled');
    }
  }

  private buildUserResponse(user: UserWithRole) {
    return {
      id: user.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      roleId: user.roleId,
      role: user.role.name,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
    };
  }

  private async signAccessToken(user: UserWithRole): Promise<string> {
    const payload = {
      sub: user.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      roleId: user.roleId,
      role: user.role.name,
    };
    return this.jwtService.signAsync(payload);
  }

  private async buildAuthResponse(
    user: UserWithRole,
    refreshToken: string,
    refreshExpiresAt: Date,
  ) {
    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      refreshToken,
      expiresIn: resolveJwtAccessTtlSeconds(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.buildUserResponse(user),
    };
  }

  async register(dto: RegisterDto, bootstrapSecret?: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: dto.hospitalId,
      },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        hospitalId: dto.hospitalId,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    this.assertRegistrationAllowed(bootstrapSecret);

    if (dto.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          hospitalId: dto.hospitalId,
          email: dto.email,
        },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        hospitalId: dto.hospitalId,
        roleId: dto.roleId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
      },
      select: {
        id: true,
        hospitalId: true,
        roleId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  private async rejectLogin(
    clientIp: string,
    dto: LoginDto,
    reason: string,
    hospitalId: string,
  ): Promise<never> {
    await this.loginRateLimitService.recordFailedAttempt(clientIp, dto.email);

    await this.auditService.log({
      hospitalId,
      action: AUTH_LOGIN_FAILED,
      entity: 'Auth',
      metadata: {
        reason,
        hospitalCode: dto.hospitalCode.trim(),
      },
    });

    throw new UnauthorizedException('Invalid email or password');
  }

  async login(dto: LoginDto, clientIp = 'unknown') {
    const hospitalCode = dto.hospitalCode.trim();

    const hospital = await this.prisma.hospital.findUnique({
      where: {
        code: hospitalCode,
      },
    });

    if (!hospital) {
      await this.loginRateLimitService.recordFailedAttempt(clientIp, dto.email);
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        hospitalId: hospital.id,
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      await this.rejectLogin(clientIp, dto, 'user_not_found', hospital.id);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user!.passwordHash,
    );

    if (!passwordMatches) {
      await this.rejectLogin(clientIp, dto, 'invalid_credentials', hospital.id);
    }

    if (user!.status !== 'ACTIVE') {
      await this.rejectLogin(clientIp, dto, 'user_inactive', hospital.id);
    }

    await this.loginRateLimitService.clearAttempts(clientIp, dto.email);

    const session = await this.authSessionService.createSessionForUser(user!);
    const response = await this.buildAuthResponse(
      user!,
      session.refreshToken,
      session.refreshExpiresAt,
    );

    await this.auditService.log({
      hospitalId: user!.hospitalId,
      branchId: user!.branchId,
      userId: user!.id,
      action: AUTH_LOGIN_SUCCEEDED,
      entity: 'AuthSession',
      entityId: session.sessionId,
      metadata: {
        familyId: session.familyId,
      },
    });

    return response;
  }

  async refresh(refreshToken: string, clientIp = 'unknown') {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    try {
      const rotated =
        await this.authSessionService.rotateRefreshToken(refreshToken);

      const response = await this.buildAuthResponse(
        rotated.user,
        rotated.refreshToken,
        rotated.refreshExpiresAt,
      );

      await this.auditService.log({
        hospitalId: rotated.user.hospitalId,
        branchId: rotated.user.branchId,
        userId: rotated.user.id,
        action: AUTH_REFRESH_SUCCEEDED,
        entity: 'AuthSession',
        entityId: rotated.sessionId,
        metadata: {
          familyId: rotated.familyId,
        },
      });

      return response;
    } catch (error) {
      if (error instanceof RefreshReuseDetectedError) {
        await this.auditService.log({
          hospitalId: error.hospitalId,
          branchId: error.branchId,
          userId: error.userId,
          action: AUTH_REFRESH_REUSE_DETECTED,
          entity: 'AuthSession',
          entityId: error.sessionId,
          metadata: {
            familyId: error.familyId,
            reason: 'reuse_detected',
          },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (error instanceof UnauthorizedException) {
        const session = await this.prisma.authSession.findUnique({
          where: { refreshTokenHash },
          select: {
            hospitalId: true,
            branchId: true,
            userId: true,
            id: true,
            familyId: true,
          },
        });

        if (session) {
          await this.auditService.log({
            hospitalId: session.hospitalId,
            branchId: session.branchId,
            userId: session.userId,
            action: AUTH_REFRESH_FAILED,
            entity: 'AuthSession',
            entityId: session.id,
            metadata: {
              familyId: session.familyId,
              reason: 'refresh_rejected',
            },
          });
        }

        throw error;
      }

      throw error;
    }
  }

  async logout(
    refreshToken: string,
    user: {
      sub: string;
      hospitalId: string;
      branchId?: string | null;
    },
  ) {
    const revoked = await this.authSessionService.revokeSessionForLogout(
      refreshToken,
      user.sub,
      user.hospitalId,
    );

    if (revoked) {
      await this.auditService.log({
        hospitalId: user.hospitalId,
        branchId: user.branchId ?? revoked.branchId,
        userId: user.sub,
        action: AUTH_LOGOUT,
        entity: 'AuthSession',
        entityId: revoked.sessionId,
        metadata: {
          familyId: revoked.familyId,
          reason: 'logout',
        },
      });
    }

    return { success: true };
  }
}
