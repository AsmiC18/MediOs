import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Resource, ResourceType, User } from '@prisma/client';

export function assertDoctorResourceUserLink(input: {
  resource: Resource;
  user: User;
  hospitalId: string;
}): void {
  if (input.resource.hospitalId !== input.hospitalId) {
    throw new NotFoundException('Resource not found');
  }

  if (input.user.hospitalId !== input.hospitalId) {
    throw new NotFoundException('User not found');
  }

  if (input.resource.type !== ResourceType.DOCTOR) {
    throw new BadRequestException(
      'Only DOCTOR resources can be linked to a staff user',
    );
  }

  if (
    input.resource.branchId != null &&
    input.user.branchId != null &&
    input.resource.branchId !== input.user.branchId
  ) {
    throw new ForbiddenException(
      'User branch is not compatible with the doctor resource branch',
    );
  }
}
