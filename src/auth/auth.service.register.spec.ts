jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

describe('AuthService.register (registration policy)', () => {
  const bootstrapSecret = 'test-bootstrap-secret-for-unit-tests';
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const roleId = '22222222-2222-4222-8222-222222222222';

  const baseDto: RegisterDto = {
    hospitalId,
    roleId,
    name: 'Register Test',
    email: 'register-test@example.com',
    password: 'password123',
  };

  let prisma: {
    hospital: { findUnique: jest.Mock };
    role: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock };
  };
  let service: AuthService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    prisma = {
      hospital: { findUnique: jest.fn() },
      role: { findFirst: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn() },
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      {} as LoginRateLimitService,
      { log: jest.fn() } as unknown as AuditService,
      {} as AuthSessionService,
    );

    process.env = { ...originalEnv };
    delete process.env.AUTH_PUBLIC_REGISTRATION_ENABLED;
    process.env.AUTH_REGISTRATION_BOOTSTRAP_SECRET = bootstrapSecret;

    prisma.hospital.findUnique.mockResolvedValue({ id: hospitalId });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'user-new',
        hospitalId: data.hospitalId,
        roleId: data.roleId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: 'ACTIVE',
        createdAt: new Date(),
      }),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns 403 when bootstrap secret is missing', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await expect(service.register(baseDto)).rejects.toThrow(
        new ForbiddenException('Registration is disabled'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('returns 403 when bootstrap secret is incorrect', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await expect(
        service.register(baseDto, 'wrong-bootstrap-secret'),
      ).rejects.toThrow(new ForbiddenException('Registration is disabled'));
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('allows registration with correct bootstrap secret for a non-ADMIN role', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });
      process.env.AUTH_PUBLIC_REGISTRATION_ENABLED = 'true';

      const user = await service.register(baseDto, bootstrapSecret);

      expect(user.roleId).toBe(roleId);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('allows ADMIN registration with correct bootstrap secret', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'ADMIN',
      });

      const user = await service.register(baseDto, bootstrapSecret);

      expect(user.roleId).toBe(roleId);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('does not allow AUTH_PUBLIC_REGISTRATION_ENABLED to bypass bootstrap', async () => {
      process.env.AUTH_PUBLIC_REGISTRATION_ENABLED = 'true';
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await expect(service.register(baseDto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('non-production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('allows registration without bootstrap when public registration is enabled by default', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'ADMIN',
      });

      const user = await service.register(baseDto);

      expect(user.roleId).toBe(roleId);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('returns 403 when public registration is disabled and bootstrap is missing', async () => {
      process.env.AUTH_PUBLIC_REGISTRATION_ENABLED = 'false';
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await expect(service.register(baseDto)).rejects.toThrow(
        new ForbiddenException('Registration is disabled'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('allows registration when public registration is disabled but bootstrap matches', async () => {
      process.env.AUTH_PUBLIC_REGISTRATION_ENABLED = 'false';
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await expect(service.register(baseDto, bootstrapSecret)).resolves.toBeDefined();
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('tenant validation', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('returns 404 when hospital does not exist', async () => {
      prisma.hospital.findUnique.mockResolvedValue(null);

      await expect(service.register(baseDto)).rejects.toThrow(
        new NotFoundException('Hospital not found'),
      );
      expect(prisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 when role does not exist for the hospital', async () => {
      prisma.role.findFirst.mockResolvedValue(null);

      await expect(service.register(baseDto)).rejects.toThrow(
        new NotFoundException('Role not found'),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('scopes role lookup to the requested hospital', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: roleId,
        name: 'RECEPTIONIST',
      });

      await service.register(baseDto);

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: {
          id: roleId,
          hospitalId,
        },
      });
    });
  });
});
