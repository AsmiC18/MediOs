jest.mock('@nestjs/jwt', () => {
  const jwtLib = require('jsonwebtoken');
  return {
    JwtService: jest.fn().mockImplementation(() => ({
      signAsync: (payload: object) =>
        Promise.resolve(
          jwtLib.sign(
            payload,
            process.env.JWT_SECRET ||
              'test-jwt-secret-at-least-32-characters-long',
            { expiresIn: '15m' },
          ),
        ),
    })),
  };
});

import {
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { RateLimitExceededException } from '../common/rate-limit/rate-limit-exceeded.exception';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import {
  AUTH_LOGIN_FAILED,
  AUTH_LOGIN_SUCCEEDED,
  AUTH_LOGOUT,
  AUTH_REFRESH_FAILED,
  AUTH_REFRESH_REUSE_DETECTED,
  AUTH_REFRESH_SUCCEEDED,
} from './auth-audit.actions';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { resolveJwtAccessTtlSeconds } from './auth-token.config';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginRateLimitService } from './login-rate-limit.service';
import { RateLimitStoreService } from '../common/rate-limit/rate-limit-store.service';
import { RefreshRateLimitService } from './refresh-rate-limit.service';
import { hashRefreshToken } from './refresh-token.util';

const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

describe('AuthService J2 (integration)', () => {
  const prisma = new PrismaClient();
  const jwtService = new JwtService();
  const auditService = new AuditService(prisma as never);
  const authSessionService = new AuthSessionService(prisma as never);
  const rateLimitStore = new RateLimitStoreService(prisma as never);
  const loginRateLimitService = new LoginRateLimitService(rateLimitStore);
  const refreshRateLimitService = new RefreshRateLimitService(rateLimitStore);

  const service = new AuthService(
    prisma as never,
    jwtService,
    loginRateLimitService,
    auditService,
    authSessionService,
  );

  let dbAvailable = false;
  let hospitalId: string;
  let branchId: string;
  let branchBId: string;
  let roleId: string;
  let roleBId: string;
  let userId: string;
  let userBId: string;
  let hospitalCode: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'password12345';

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    hospitalCode = `J2-${runId}`;
    const hospital = await prisma.hospital.create({
      data: {
        name: 'J2 Auth Hospital',
        code: hospitalCode,
        branches: {
          create: [
            { name: 'Branch A', code: 'A' },
            { name: 'Branch B', code: 'B' },
          ],
        },
        roles: {
          create: [
            { name: 'J2_ADMIN', description: 'J2 admin' },
            { name: 'J2_STAFF', description: 'J2 staff' },
          ],
        },
      },
      include: { branches: true, roles: true },
    });

    hospitalId = hospital.id;
    branchId = hospital.branches.find((b) => b.code === 'A')!.id;
    branchBId = hospital.branches.find((b) => b.code === 'B')!.id;
    roleId = hospital.roles.find((r) => r.name === 'J2_ADMIN')!.id;
    roleBId = hospital.roles.find((r) => r.name === 'J2_STAFF')!.id;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'J2 User',
        email: `j2-user-${runId}@test.com`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    userId = user.id;

    const userB = await prisma.user.create({
      data: {
        hospitalId,
        branchId: branchBId,
        roleId: roleBId,
        name: 'J2 User B',
        email: `j2-user-b-${runId}@test.com`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    userBId = userB.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.auditLog.deleteMany({ where: { hospitalId } });
    await prisma.authSession.deleteMany({ where: { hospitalId } });
    await prisma.user.deleteMany({ where: { hospitalId } });
    await prisma.role.deleteMany({ where: { hospitalId } });
    await prisma.branch.deleteMany({ where: { hospitalId } });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await rateLimitStore.deleteScope('login');
      await rateLimitStore.deleteScope('refresh');
      await fn();
    });
  };

  const login = async (email = `j2-user-${runId}@test.com`) =>
    service.login(
      {
        email,
        hospitalCode,
        password,
      },
      '127.0.0.1',
    );

  describe('login and sessions', () => {
    itDb('returns refresh token and expiry fields', async () => {
      const result = await login();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(resolveJwtAccessTtlSeconds());
      expect(result.refreshExpiresAt).toBeDefined();
      expect(result.user.id).toBe(userId);

      const decoded = jwt.decode(result.accessToken) as {
        exp: number;
        iat: number;
      };
      expect(decoded.exp - decoded.iat).toBe(resolveJwtAccessTtlSeconds());
    });

    itDb('stores SHA-256 hash only in AuthSession', async () => {
      const result = await login();
      const hash = hashRefreshToken(result.refreshToken);
      const session = await prisma.authSession.findUnique({
        where: { refreshTokenHash: hash },
      });
      expect(session).toBeTruthy();
      expect(session!.refreshTokenHash).toBe(hash);
      expect(session!.refreshTokenHash).not.toBe(result.refreshToken);
    });

    itDb('writes AUTH_LOGIN_SUCCEEDED audit without tokens', async () => {
      await login();
      const log = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_LOGIN_SUCCEEDED, userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toBeTruthy();
      const metadata = JSON.stringify(log!.metadata ?? {});
      expect(metadata).not.toMatch(/refreshToken|accessToken|password/i);
    });

    itDb('writes AUTH_LOGIN_FAILED audit on bad password', async () => {
      await expect(
        service.login(
          {
            email: `j2-user-${runId}@test.com`,
            hospitalCode,
            password: 'wrong-password-1',
          },
          '127.0.0.1',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const log = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_LOGIN_FAILED },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.metadata).toMatchObject({ reason: 'invalid_credentials' });
      const metadata = JSON.stringify(log!.metadata ?? {});
      expect(metadata).not.toMatch(/password|refreshToken|accessToken/i);
    });
  });

  describe('refresh', () => {
    itDb('returns new tokens and revokes old session', async () => {
      const first = await login();
      const refreshed = await service.refresh(first.refreshToken, '127.0.0.1');

      expect(refreshed.accessToken).toBeDefined();
      expect(refreshed.refreshToken).not.toBe(first.refreshToken);

      const oldHash = hashRefreshToken(first.refreshToken);
      const oldSession = await prisma.authSession.findUnique({
        where: { refreshTokenHash: oldHash },
      });
      expect(oldSession?.revokedAt).toBeTruthy();
      expect(oldSession?.revokeReason).toBe('rotation');
    });

    itDb('rejects reuse of rotated refresh token and revokes family', async () => {
      const first = await login();
      const rotated = await service.refresh(first.refreshToken, '127.0.0.1');

      await expect(
        service.refresh(first.refreshToken, '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const reuseLog = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_REFRESH_REUSE_DETECTED },
        orderBy: { createdAt: 'desc' },
      });
      expect(reuseLog).toBeTruthy();

      const newHash = hashRefreshToken(rotated.refreshToken);
      const newSession = await prisma.authSession.findUnique({
        where: { refreshTokenHash: newHash },
      });
      expect(newSession?.revokedAt).toBeTruthy();
    });

    itDb('has exactly one winner for concurrent refresh', async () => {
      const first = await login();
      const token = first.refreshToken;

      const results = await Promise.allSettled([
        service.refresh(token, '127.0.0.1'),
        service.refresh(token, '127.0.0.1'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    itDb('rejects expired refresh token', async () => {
      const first = await login();
      const hash = hashRefreshToken(first.refreshToken);
      await prisma.authSession.update({
        where: { refreshTokenHash: hash },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(
        service.refresh(first.refreshToken, '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    itDb('rejects inactive user on refresh', async () => {
      const first = await login();
      await prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.INACTIVE },
      });

      await expect(
        service.refresh(first.refreshToken, '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      await prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ACTIVE },
      });
    });

    itDb('rejects when session hospitalId does not match user hospitalId', async () => {
      const first = await login();
      const hash = hashRefreshToken(first.refreshToken);
      const otherHospital = await prisma.hospital.create({
        data: { name: 'Other', code: `J2-OTHER-${runId}` },
      });
      try {
        await prisma.authSession.update({
          where: { refreshTokenHash: hash },
          data: { hospitalId: otherHospital.id },
        });

        await expect(
          service.refresh(first.refreshToken, '127.0.0.1'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      } finally {
        await prisma.authSession.deleteMany({
          where: { refreshTokenHash: hash },
        });
        await prisma.hospital.delete({ where: { id: otherHospital.id } });
      }
    });

    itDb('uses current DB branch and role in refreshed access token', async () => {
      const first = await login();
      await prisma.user.update({
        where: { id: userId },
        data: { branchId: branchBId, roleId: roleBId },
      });

      const refreshed = await service.refresh(first.refreshToken, '127.0.0.1');
      const decoded = jwt.decode(refreshed.accessToken) as {
        branchId: string;
        roleId: string;
        role: string;
      };

      expect(decoded.branchId).toBe(branchBId);
      expect(decoded.roleId).toBe(roleBId);
      expect(decoded.role).toBe('J2_STAFF');

      await prisma.user.update({
        where: { id: userId },
        data: { branchId, roleId },
      });
    });

    itDb('writes AUTH_REFRESH_SUCCEEDED and AUTH_REFRESH_FAILED audits', async () => {
      const first = await login();
      await service.refresh(first.refreshToken, '127.0.0.1');

      const success = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_REFRESH_SUCCEEDED },
        orderBy: { createdAt: 'desc' },
      });
      expect(success).toBeTruthy();

      const expiredLogin = await login();
      const expiredHash = hashRefreshToken(expiredLogin.refreshToken);
      await prisma.authSession.update({
        where: { refreshTokenHash: expiredHash },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await expect(
        service.refresh(expiredLogin.refreshToken, '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const failed = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_REFRESH_FAILED },
        orderBy: { createdAt: 'desc' },
      });
      expect(failed).toBeTruthy();

      for (const log of [success, failed]) {
        const metadata = JSON.stringify(log!.metadata ?? {});
        expect(metadata).not.toMatch(/refreshToken|accessToken|password/i);
      }
    });
  });

  describe('logout', () => {
    itDb('revokes refresh session and writes AUTH_LOGOUT', async () => {
      const first = await login();
      await service.logout(first.refreshToken, {
        sub: userId,
        hospitalId,
        branchId,
      });

      await expect(
        service.refresh(first.refreshToken, '127.0.0.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const log = await prisma.auditLog.findFirst({
        where: { hospitalId, action: AUTH_LOGOUT, userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toBeTruthy();
    });

    itDb('cannot revoke another user refresh session', async () => {
      const userASession = await login();
      const userBSession = await login(`j2-user-b-${runId}@test.com`);

      await expect(
        service.logout(userBSession.refreshToken, {
          sub: userId,
          hospitalId,
          branchId,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const hash = hashRefreshToken(userBSession.refreshToken);
      const session = await prisma.authSession.findUnique({
        where: { refreshTokenHash: hash },
      });
      expect(session?.revokedAt).toBeNull();

      await service.logout(userASession.refreshToken, {
        sub: userId,
        hospitalId,
        branchId,
      });
    });
  });

  describe('refresh rate limiting', () => {
    itDb('returns 429 when refresh rate limit exceeded', async () => {
      process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = '1';
      process.env.REFRESH_RATE_LIMIT_WINDOW_MS = '900000';
      await rateLimitStore.deleteScope('refresh');

      const badToken = '0123456789abcdef0123456789abcdef';
      const hash = hashRefreshToken(badToken);
      await refreshRateLimitService.recordAttempt('10.0.0.99', hash);
      await expect(
        refreshRateLimitService.recordAttempt('10.0.0.99', hash),
      ).rejects.toBeInstanceOf(RateLimitExceededException);

      delete process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS;
    });
  });

  describe('RefreshTokenDto validation', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it('rejects hospitalId on refresh body', async () => {
      await expect(
        pipe.transform(
          {
            refreshToken: '0123456789abcdef0123456789abcdef',
            hospitalId: '11111111-1111-4111-8111-111111111111',
          },
          { type: 'body', metatype: RefreshTokenDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects roleId on refresh body', async () => {
      await expect(
        pipe.transform(
          {
            refreshToken: '0123456789abcdef0123456789abcdef',
            roleId: '22222222-2222-4222-8222-222222222222',
          },
          { type: 'body', metatype: RefreshTokenDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects branchId on refresh body', async () => {
      await expect(
        pipe.transform(
          {
            refreshToken: '0123456789abcdef0123456789abcdef',
            branchId: '33333333-3333-4333-8333-333333333333',
          },
          { type: 'body', metatype: RefreshTokenDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
