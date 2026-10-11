import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InsurancePreAuthorizationStatus,
  Prisma,
} from '@prisma/client';
import { assertBranchAccess } from '../../common/auth/branch-scope.util';

type GateUser = {
  hospitalId: string;
  branchId?: string | null;
};

const APPROVED_PREAUTH_STATUSES: InsurancePreAuthorizationStatus[] = [
  InsurancePreAuthorizationStatus.APPROVED,
  InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
];

export async function assertSurgeryInsuranceGate(
  client: Prisma.TransactionClient | { insurancePreAuthorization: Prisma.TransactionClient['insurancePreAuthorization'] },
  user: GateUser,
  input: {
    patientId: string;
    preAuthorizationId: string | null | undefined;
  },
): Promise<void> {
  if (!input.preAuthorizationId) {
    return;
  }

  const preAuth = await client.insurancePreAuthorization.findFirst({
    where: {
      id: input.preAuthorizationId,
      hospitalId: user.hospitalId,
    },
  });

  if (!preAuth) {
    throw new NotFoundException('Insurance pre-authorization not found');
  }

  if (preAuth.patientId !== input.patientId) {
    throw new BadRequestException(
      'Pre-authorization patient does not match surgery patient',
    );
  }

  try {
    assertBranchAccess(user, preAuth.branchId);
  } catch {
    throw new ForbiddenException(
      'Pre-authorization is not accessible for your branch scope',
    );
  }

  if (!APPROVED_PREAUTH_STATUSES.includes(preAuth.status)) {
    throw new BadRequestException(
      `Surgery requires an approved pre-authorization; current status is ${preAuth.status}`,
    );
  }
}
