import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ResourceStatus, ResourceType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResourcesService } from './resources.service';

describe('ResourcesService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const resourceIdA = 'resource-a';
  const resourceIdB = 'resource-b';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

  const hospitalWideUser = {
    sub: 'user-hospital-wide',
    hospitalId,
    branchId: null as string | null,
  };

  let prisma: {
    resource: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    branch: { findUnique: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: ResourcesService;

  const resourceBranchA = {
    id: resourceIdA,
    hospitalId,
    branchId: branchA,
    type: ResourceType.ROOM,
    name: 'Room A',
    description: null,
    status: ResourceStatus.ACTIVE,
  };

  const resourceBranchB = {
    id: resourceIdB,
    hospitalId,
    branchId: branchB,
    type: ResourceType.ROOM,
    name: 'Room B',
    description: null,
    status: ResourceStatus.ACTIVE,
  };

  beforeEach(() => {
    prisma = {
      resource: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) =>
          Promise.resolve(
            id === branchA || id === branchB
              ? { id, hospitalId, isActive: true }
              : null,
          ),
        ),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ResourcesService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('findOne', () => {
    it('allows branch user to read own-branch resource', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchA);

      const result = await service.findOne(branchUser, resourceIdA);

      expect(result.id).toBe(resourceIdA);
    });

    it('denies branch user reading another-branch resource', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchB);

      await expect(service.findOne(branchUser, resourceIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('preserves cross-hospital denial as not found', async () => {
      prisma.resource.findUnique.mockResolvedValue({
        ...resourceBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(service.findOne(branchUser, resourceIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('scopes branch user list to JWT branch', async () => {
      await service.findAll(branchUser, {});

      expect(prisma.resource.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('does not allow client branchId to override JWT branch', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      expect(prisma.resource.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide user to list across branches', async () => {
      await service.findAll(hospitalWideUser, {});

      expect(
        prisma.resource.findMany.mock.calls[0][0].where.branchId,
      ).toBeUndefined();
    });

    it('allows hospital-wide user to filter by branchId', async () => {
      await service.findAll(hospitalWideUser, { branchId: branchB });

      expect(prisma.resource.findMany.mock.calls[0][0].where.branchId).toBe(
        branchB,
      );
    });
  });

  describe('create', () => {
    const createDto = {
      type: ResourceType.ROOM,
      name: 'New room',
    };

    beforeEach(() => {
      prisma.resource.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-resource', ...data }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      await service.create(branchUser, { ...createDto, branchId: branchB });

      expect(prisma.resource.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('preserves hospital-wide DTO branch behavior', async () => {
      await service.create(hospitalWideUser, {
        ...createDto,
        branchId: branchB,
      });

      expect(prisma.resource.create.mock.calls[0][0].data.branchId).toBe(
        branchB,
      );
    });
  });

  describe('update', () => {
    it('allows same-branch update for branch user', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchA);
      prisma.resource.update.mockResolvedValue({
        ...resourceBranchA,
        name: 'Renamed',
      });

      const result = await service.update(branchUser, resourceIdA, {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
    });

    it('denies branch user moving resource to another branch', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchA);

      await expect(
        service.update(branchUser, resourceIdA, { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies cross-branch update', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchB);

      await expect(
        service.update(branchUser, resourceIdB, { name: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    it('preserves hospital-wide branch update behavior', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchA);
      prisma.resource.update.mockResolvedValue({
        ...resourceBranchA,
        branchId: branchB,
      });

      await service.update(hospitalWideUser, resourceIdA, {
        branchId: branchB,
      });

      expect(prisma.resource.update.mock.calls[0][0].data.branchId).toBe(
        branchB,
      );
    });
  });

  describe('deactivate', () => {
    it('denies cross-branch deactivate', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchB);

      await expect(
        service.deactivate(branchUser, resourceIdB),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    it('allows same-branch deactivate', async () => {
      prisma.resource.findUnique.mockResolvedValue(resourceBranchA);
      prisma.resource.update.mockResolvedValue({
        ...resourceBranchA,
        status: ResourceStatus.INACTIVE,
      });

      const result = await service.deactivate(branchUser, resourceIdA);

      expect(result.status).toBe(ResourceStatus.INACTIVE);
    });
  });
});
