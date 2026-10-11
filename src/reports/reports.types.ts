export type ReportAuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export const MAX_HSN_BREAKDOWN_ROWS = 500;
