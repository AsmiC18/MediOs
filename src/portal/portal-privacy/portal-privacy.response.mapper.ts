import { PatientPrivacyErasureStatus } from '@prisma/client';

export type PortalConsentResponse = {
  id: string;
  purpose: string;
  status: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
  relatedGrantId: string | null;
  createdAt: string;
};

export function mapPortalConsent(row: {
  id: string;
  purpose: string;
  status: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
  relatedGrantId: string | null;
  createdAt: string;
}): PortalConsentResponse {
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    grantedAt: row.grantedAt,
    withdrawnAt: row.withdrawnAt,
    relatedGrantId: row.relatedGrantId,
    createdAt: row.createdAt,
  };
}

export type PortalErasureResponse = {
  id: string;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
};

export function mapPortalErasure(row: {
  id: string;
  status: PatientPrivacyErasureStatus;
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}): PortalErasureResponse {
  const approvedAt =
    row.status === PatientPrivacyErasureStatus.APPROVED ||
    row.status === PatientPrivacyErasureStatus.PROCESSING ||
    row.status === PatientPrivacyErasureStatus.COMPLETED
      ? row.updatedAt
      : null;
  const rejectedAt =
    row.status === PatientPrivacyErasureStatus.REJECTED ? row.updatedAt : null;

  return {
    id: row.id,
    status: row.status,
    requestedAt: row.createdAt,
    approvedAt,
    rejectedAt,
    completedAt: row.completedAt,
    rejectionReason: row.rejectionReason,
  };
}
