import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ResourceStatus, ResourceType } from '@prisma/client';
import { assertDoctorResourceUserLink } from './resource-user-link.util';

describe('resource-user-link.util', () => {
  const hospitalId = 'h1';

  it('rejects non-DOCTOR resource mapping', () => {
    expect(() =>
      assertDoctorResourceUserLink({
        hospitalId,
        resource: {
          id: 'r1',
          hospitalId,
          branchId: null,
          userId: null,
          type: ResourceType.ROOM,
          name: 'Room',
          description: null,
          status: ResourceStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: {
          id: 'u1',
          hospitalId,
          branchId: null,
          roleId: 'role',
          name: 'Doc',
          email: null,
          phone: null,
          passwordHash: 'x',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects incompatible branch mapping', () => {
    expect(() =>
      assertDoctorResourceUserLink({
        hospitalId,
        resource: {
          id: 'r1',
          hospitalId,
          branchId: 'b1',
          userId: null,
          type: ResourceType.DOCTOR,
          name: 'Doc',
          description: null,
          status: ResourceStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: {
          id: 'u1',
          hospitalId,
          branchId: 'b2',
          roleId: 'role',
          name: 'Doc',
          email: null,
          phone: null,
          passwordHash: 'x',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).toThrow(ForbiddenException);
  });
});
