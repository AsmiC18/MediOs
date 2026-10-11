import { ForbiddenException } from '@nestjs/common';

/** JWT / request user fields required for branch-scope checks. */
export type BranchScopeUser = {
  branchId?: string | null;
};

const BRANCH_ACCESS_DENIED_MESSAGE = 'Access to this branch is not permitted';

/**
 * Enforces branch-level access for branch-scoped users.
 * Hospital-wide users (branchId null/undefined) are not restricted by branch.
 */
export function assertBranchAccess(
  user: BranchScopeUser,
  entityBranchId: string | null | undefined,
): void {
  const userBranchId = user.branchId ?? null;

  if (userBranchId === null) {
    return;
  }

  if (entityBranchId == null || entityBranchId !== userBranchId) {
    throw new ForbiddenException(BRANCH_ACCESS_DENIED_MESSAGE);
  }
}

/**
 * Applies JWT branch scope to a Prisma-style where clause.
 * Branch-scoped users always query their branch; client-supplied branchId cannot widen scope.
 */
export function applyBranchScope<T extends Record<string, unknown>>(
  user: BranchScopeUser,
  where: T,
): T {
  const userBranchId = user.branchId ?? null;

  if (userBranchId === null) {
    return where;
  }

  return {
    ...where,
    branchId: userBranchId,
  };
}

/** Branch-scoped users always create in their branch; hospital-wide users may choose. */
export function resolveCreateBranchId(
  user: BranchScopeUser,
  dtoBranchId?: string | null,
): string | null | undefined {
  if (user.branchId != null) {
    return user.branchId;
  }

  return dtoBranchId;
}

/**
 * Branch-scoped users cannot move entities to another branch via DTO.
 * Returns undefined when no branch field update should be applied.
 */
export function resolveUpdateBranchId(
  user: BranchScopeUser,
  dtoBranchId: string | null | undefined,
): string | null | undefined {
  if (user.branchId != null) {
    if (dtoBranchId !== undefined && dtoBranchId !== user.branchId) {
      throw new ForbiddenException(BRANCH_ACCESS_DENIED_MESSAGE);
    }

    return undefined;
  }

  return dtoBranchId;
}
