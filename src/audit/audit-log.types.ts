export type AuditLogAuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export const AUDIT_LOG_EXPORT_MAX_ROWS = 5000;

export const AUDIT_LOG_LIST_SELECT = {
  id: true,
  hospitalId: true,
  branchId: true,
  userId: true,
  action: true,
  entity: true,
  entityId: true,
  createdAt: true,
} as const;
