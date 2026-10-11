export type AuditLogListItemDto = {
  id: string;
  hospitalId: string;
  branchId: string | null;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: Date;
};

export type AuditLogListResponseDto = {
  data: AuditLogListItemDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
