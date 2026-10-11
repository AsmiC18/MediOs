export const SYSTEM_ADMIN_ROLE_NAME = 'ADMIN';

export const RBAC_ADMIN_REQUIRED_PERMISSIONS = [
  'roles:read',
  'roles:manage',
  'users:read',
  'users:manage',
] as const;

export type RbacAuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId: string;
  role?: string;
};
