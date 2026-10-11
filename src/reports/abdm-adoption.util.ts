import { AbdmConsentStatus, AbhaLinkStatus, Prisma } from '@prisma/client';

export type AbdmAdoptionSummary = {
  from: string;
  to: string;
  branchId: string | null;
  dataScope: 'local_abdm_records_only';
  externalExchangeNote: string;
  patients: {
    activePatientCount: number;
    abhaLinkedCount: number;
    abhaLinkedPercent: string;
    timeBasis: 'PatientAbhaLink.linkStatus as of query';
  };
  consents: {
    timeBasis: 'AbdmConsent.createdAt in [from, to)';
    createdInRange: number;
    byStatus: Array<{ status: AbdmConsentStatus; count: number }>;
    grantedInRange: number;
    deniedInRange: number;
    revokedInRange: number;
  };
};

function branchPatientFilter(
  branchId: string | null | undefined,
): Prisma.PatientWhereInput {
  return branchId != null ? { branchId } : {};
}

export async function buildAbdmAdoptionSummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<AbdmAdoptionSummary> {
  const from = new Date(input.from);
  const to = new Date(input.to);

  const patientWhere: Prisma.PatientWhereInput = {
    hospitalId: input.hospitalId,
    anonymizedAt: null,
    ...branchPatientFilter(input.branchId),
  };

  const activePatientCount = await prisma.patient.count({ where: patientWhere });

  const abhaLinkedCount = await prisma.patientAbhaLink.count({
    where: {
      hospitalId: input.hospitalId,
      linkStatus: AbhaLinkStatus.LINKED,
      patient: patientWhere,
    },
  });

  const abhaLinkedPercent =
    activePatientCount === 0
      ? '0.00'
      : ((abhaLinkedCount / activePatientCount) * 100).toFixed(2);

  const consentWhere: Prisma.AbdmConsentWhereInput = {
    hospitalId: input.hospitalId,
    createdAt: { gte: from, lt: to },
  };
  if (input.branchId != null) {
    consentWhere.branchId = input.branchId;
  }

  const consentGroups = await prisma.abdmConsent.groupBy({
    by: ['status'],
    where: consentWhere,
    _count: { _all: true },
  });

  const byStatus = consentGroups
    .map((row) => ({ status: row.status, count: row._count._all }))
    .sort((a, b) => a.status.localeCompare(b.status));

  const createdInRange = byStatus.reduce((sum, row) => sum + row.count, 0);

  const grantedInRange = await prisma.abdmConsent.count({
    where: {
      ...consentWhere,
      grantedAt: { gte: from, lt: to },
    },
  });

  const deniedInRange = await prisma.abdmConsent.count({
    where: {
      ...consentWhere,
      deniedAt: { gte: from, lt: to },
    },
  });

  const revokedInRange = await prisma.abdmConsent.count({
    where: {
      ...consentWhere,
      revokedAt: { gte: from, lt: to },
    },
  });

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    dataScope: 'local_abdm_records_only',
    externalExchangeNote:
      'Metrics reflect MediOS-local ABHA links and ABDM consent records only; external ABDM exchange/FHIR activity is not included.',
    patients: {
      activePatientCount,
      abhaLinkedCount,
      abhaLinkedPercent,
      timeBasis: 'PatientAbhaLink.linkStatus as of query',
    },
    consents: {
      timeBasis: 'AbdmConsent.createdAt in [from, to)',
      createdInRange,
      byStatus,
      grantedInRange,
      deniedInRange,
      revokedInRange,
    },
  };
}
