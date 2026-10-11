import {
  PatientPrivacyErasureStatus,
  PatientPrivacyPurpose,
  PrismaClient,
} from '@prisma/client';
import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { toStaffJwtUser } from '../../auth/staff-jwt-payload.util';
import { LocalClinicalBlobStorageAdapter } from '../../clinical/attachments/storage/local-clinical-blob-storage.adapter';
import { JobService } from '../../jobs/job.service';
import { PatientPrivacyConsentService } from '../../privacy/patient-privacy-consent.service';
import { PatientPrivacyErasureService } from '../../privacy/patient-privacy-erasure.service';
import { PatientPrivacyExportService } from '../../privacy/patient-privacy-export.service';
import { canonicalizePatientPhone } from '../../common/utils/phone.util';
import { toPatientPrincipal } from '../portal-auth/portal-jwt-payload.util';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PATIENT_PRINCIPAL_TYPE, PatientPrincipal } from '../portal.types';
import { PortalGrantConsentDto } from './dto/portal-grant-consent.dto';
import { PortalPrivacyService } from './portal-privacy.service';

const SENSITIVE_KEYS = [
  'passwordHash',
  'storageKey',
  'linkToken',
  'refreshToken',
  'accessToken',
  'recordedByUserId',
  'requestedByUserId',
  'decidedByUserId',
  'workerId',
  'jobId',
];

function assertNoSensitiveFields(value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveFields);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(
        SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase())),
      ).toBe(false);
      assertNoSensitiveFields(nested);
    }
  }
}

describe('Patient portal privacy integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let staffUserId: string;
  let adminUserId: string;
  let staffRoleId: string;
  let adminRoleId: string;

  let patientAId: string;
  let patientBId: string;
  let otherHospitalPatientId: string;
  let digitSuffix: string;

  let portalPrivacy: PortalPrivacyService;
  let consentService: PatientPrivacyConsentService;
  let exportService: PatientPrivacyExportService;
  let erasureService: PatientPrivacyErasureService;
  let portalPrincipalGuard: PortalPrincipalGuard;

  const principalA = (): PatientPrincipal => ({
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId: patientAId,
    hospitalId,
    branchId,
  });

  const principalB = (): PatientPrincipal => ({
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId: patientBId,
    hospitalId,
    branchId,
  });

  const staffActor = () => ({
    sub: staffUserId,
    hospitalId,
    branchId: null as string | null,
  });

  const adminActor = () => ({
    sub: adminUserId,
    hospitalId,
    branchId: null as string | null,
  });

  async function grant(roleId: string, permissionName: string) {
    const permission = await prisma.permission.upsert({
      where: { name: permissionName },
      update: {},
      create: { name: permissionName, description: permissionName },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  }

  const itDb = (name: string, fn: () => Promise<void>, timeout?: number) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    }, timeout);
  };

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    const blob = new LocalClinicalBlobStorageAdapter();
    const jobService = new JobService(prisma as never);
    consentService = new PatientPrivacyConsentService(prisma as never, audit);
    exportService = new PatientPrivacyExportService(prisma as never, audit);
    erasureService = new PatientPrivacyErasureService(
      prisma as never,
      audit,
      jobService,
      blob,
    );
    portalPrivacy = new PortalPrivacyService(
      prisma as never,
      audit,
      consentService,
      exportService,
      erasureService,
    );
    portalPrincipalGuard = new PortalPrincipalGuard(prisma as never);

    const hospital = await prisma.hospital.create({
      data: { name: `PP5 ${runId}`, code: `PP5-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `PP5O ${runId}`, code: `PP5O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Main', code: `PP5B-${runId}` },
      })
    ).id;

    staffRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `PP5R-${runId}` },
      })
    ).id;
    adminRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `PP5A-${runId}` },
      })
    ).id;

    await grant(staffRoleId, 'patients:read');
    await grant(staffRoleId, 'patients:update');
    await grant(adminRoleId, 'patients:privacy:manage');
    await grant(adminRoleId, 'patients:update');

    const staffUser = await prisma.user.create({
      data: {
        hospitalId,
        roleId: staffRoleId,
        email: `pp5-staff-${runId}@test.com`,
        name: 'Staff',
        passwordHash: 'hash',
      },
    });
    staffUserId = staffUser.id;

    const adminUser = await prisma.user.create({
      data: {
        hospitalId,
        roleId: adminRoleId,
        email: `pp5-admin-${runId}@test.com`,
        name: 'Admin',
        passwordHash: 'hash',
      },
    });
    adminUserId = adminUser.id;

    digitSuffix = runId.replace(/\D/g, '').slice(-9);
    const phoneA = canonicalizePatientPhone(`9${digitSuffix}`);
    patientAId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PortalA',
          phone: phoneA,
        },
      })
    ).id;

    patientBId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PortalB',
          phone: canonicalizePatientPhone(`8${digitSuffix}`),
        },
      })
    ).id;

    otherHospitalPatientId = (
      await prisma.patient.create({
        data: {
          hospitalId: otherHospitalId,
          firstName: 'OtherH',
          phone: canonicalizePatientPhone(`7${digitSuffix}`),
        },
      })
    ).id;

    await prisma.patientPortalAccount.create({
      data: {
        patientId: patientAId,
        hospitalId,
        passwordHash: '$2b$12$testportalaccounthash000000000000',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  itDb('consents: view, grant all purposes, withdraw, isolation, append-only', async () => {
    const empty = await portalPrivacy.listConsents(principalA());
    expect(Array.isArray(empty)).toBe(true);

    const care = await portalPrivacy.grantConsent(principalA(), {
      purpose: PatientPrivacyPurpose.CARE,
    });
    expect(care.status).toBe('GRANTED');
    expect(care.purpose).toBe('CARE');

    const comm = await portalPrivacy.grantConsent(principalA(), {
      purpose: PatientPrivacyPurpose.COMMUNICATION,
    });
    expect(comm.purpose).toBe('COMMUNICATION');

    const data = await portalPrivacy.grantConsent(principalA(), {
      purpose: PatientPrivacyPurpose.DATA_PROCESSING,
    });
    expect(data.purpose).toBe('DATA_PROCESSING');

    const history = await portalPrivacy.listConsents(principalA());
    expect(history.length).toBeGreaterThanOrEqual(3);
    assertNoSensitiveFields(history);
    expect(JSON.stringify(history)).not.toMatch(/recordedByUserId|consentType/i);

    const withdrawn = await portalPrivacy.withdrawConsent(principalA(), care.id);
    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(withdrawn.relatedGrantId).toBe(care.id);

    const afterWithdraw = await portalPrivacy.listConsents(principalA());
    const grantRow = afterWithdraw.find((r) => r.id === care.id);
    expect(grantRow?.status).toBe('GRANTED');

    const otherGrant = await consentService.grantConsent(staffActor(), patientBId, {
      purpose: PatientPrivacyPurpose.CARE,
    });

    await expect(
      portalPrivacy.withdrawConsent(principalA(), otherGrant.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const crossHospitalGrant = await consentService.grantConsent(
      { sub: staffUserId, hospitalId: otherHospitalId, branchId: null },
      otherHospitalPatientId,
      { purpose: PatientPrivacyPurpose.CARE },
    );
    await expect(
      portalPrivacy.withdrawConsent(principalA(), crossHospitalGrant.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('export: own data, principal identity, no secrets', async () => {
    const exported = await portalPrivacy.requestExport(principalA());
    expect(exported).toMatchObject({
      patientId: patientAId,
      hospitalId,
    });
    const retrieved = await portalPrivacy.getExport(principalA());
    expect(retrieved.patientId).toBe(patientAId);

    await expect(
      exportService.exportPatientData(staffActor(), otherHospitalPatientId),
    ).rejects.toBeInstanceOf(NotFoundException);

    assertNoSensitiveFields(exported);
    expect(JSON.stringify(exported)).not.toMatch(/storageKey|passwordHash|linkToken/i);
  });

  itDb('erasure: submit, view, duplicate, staff workflow, no patient approve', async () => {
    const erasurePatient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'EraseMe',
        phone: canonicalizePatientPhone(`6${digitSuffix}`),
      },
    });

    await prisma.patientPortalAccount.create({
      data: {
        patientId: erasurePatient.id,
        hospitalId,
        passwordHash: '$2b$12$testportalaccounthash000000000000',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    const erasurePrincipal = (): PatientPrincipal => ({
      principalType: PATIENT_PRINCIPAL_TYPE,
      patientId: erasurePatient.id,
      hospitalId,
      branchId,
    });

    const req = await portalPrivacy.requestErasure(erasurePrincipal());
    expect(req.status).toBe(PatientPrivacyErasureStatus.REQUESTED);
    assertNoSensitiveFields(req);

    const status = await portalPrivacy.getErasureStatus(erasurePrincipal());
    expect(status.id).toBe(req.id);

    await expect(
      portalPrivacy.requestErasure(erasurePrincipal()),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      erasureService.requestErasure(staffActor(), otherHospitalPatientId),
    ).rejects.toBeInstanceOf(NotFoundException);

    const approved = await erasureService.approveErasure(
      adminActor(),
      erasurePatient.id,
    );
    expect(approved.status).toBe(PatientPrivacyErasureStatus.APPROVED);

    await erasureService.processErasureJob({
      erasureRequestId: approved.id,
      patientId: erasurePatient.id,
      actorUserId: adminUserId,
    });

    const anonymized = await prisma.patient.findUniqueOrThrow({
      where: { id: erasurePatient.id },
    });
    expect(anonymized.anonymizedAt).not.toBeNull();
  });

  itDb('security: JWT separation, guard, body cannot override identity', async () => {
    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: staffUserId,
        hospitalId,
        roleId: staffRoleId,
      } as never),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: patientAId,
        hospitalId,
        branchId,
      }),
    ).toThrow(UnauthorizedException);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: principalA() }),
      }),
    } as ExecutionContext;
    await expect(portalPrincipalGuard.canActivate(ctx)).resolves.toBe(true);

    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: new Date() },
    });

    await expect(
      portalPrivacy.grantConsent(principalA(), {
        purpose: PatientPrivacyPurpose.CARE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: null },
    });

    const dto: PortalGrantConsentDto & {
      patientId?: string;
      hospitalId?: string;
      status?: string;
    } = {
      purpose: PatientPrivacyPurpose.CARE,
      patientId: patientBId,
      hospitalId: otherHospitalId,
      status: 'WITHDRAWN',
    };
    const granted = await portalPrivacy.grantConsent(principalA(), dto);
    expect(granted.status).toBe('GRANTED');

    const row = await prisma.patientPrivacyConsent.findUniqueOrThrow({
      where: { id: granted.id },
    });
    expect(row.patientId).toBe(patientAId);
    expect(row.hospitalId).toBe(hospitalId);
  });

  itDb('staff privacy APIs unchanged; portal has no approve/reject', async () => {
    const staffList = await consentService.listConsents(staffActor(), patientBId);
    expect(Array.isArray(staffList)).toBe(true);

    const staffGrant = await consentService.grantConsent(staffActor(), patientBId, {
      purpose: PatientPrivacyPurpose.DATA_PROCESSING,
    });
    expect(staffGrant.patientId).toBe(patientBId);

    const p = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'StaffErase',
        phone: canonicalizePatientPhone(`91${digitSuffix.slice(0, 8)}`),
      },
    });

    await erasureService.requestErasure(staffActor(), p.id);
    const approved = await erasureService.approveErasure(adminActor(), p.id);
    expect(approved.status).toBe(PatientPrivacyErasureStatus.APPROVED);

    expect(
      (portalPrivacy as { approveErasure?: unknown }).approveErasure,
    ).toBeUndefined();
    expect(
      (portalPrivacy as { rejectErasure?: unknown }).rejectErasure,
    ).toBeUndefined();
  });
});
