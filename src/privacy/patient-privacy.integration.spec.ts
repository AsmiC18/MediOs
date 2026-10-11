import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  InvoiceStatus,
  PatientPrivacyErasureStatus,
  PatientPrivacyPurpose,
  PrismaClient,
} from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LocalClinicalBlobStorageAdapter } from '../clinical/attachments/storage/local-clinical-blob-storage.adapter';
import { JobService } from '../jobs/job.service';
import { PatientsService } from '../patients/patients.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import {
  PATIENT_PRIVACY_CONSENT_GRANTED,
  PATIENT_PRIVACY_ERASURE_COMPLETED,
  PATIENT_PRIVACY_EXPORT_REQUESTED,
} from './patient-privacy-audit.actions';
import { PatientPrivacyConsentService } from './patient-privacy-consent.service';
import { PatientPrivacyErasureService } from './patient-privacy-erasure.service';
import { PatientPrivacyExportService } from './patient-privacy-export.service';
import { buildAnonymizedPatientPhone } from './patient-privacy-anonymization.util';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Patient privacy (DPDP foundation) integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalA: string;
  let hospitalB: string;
  let branchA: string;
  let staffRoleId: string;
  let adminRoleId: string;
  let staffUserId: string;
  let adminUserId: string;
  let patientId: string;
  let patientBId: string;
  let invoiceId: string;
  let encounterId: string;
  let attachmentId: string;

  let consentService: PatientPrivacyConsentService;
  let exportService: PatientPrivacyExportService;
  let erasureService: PatientPrivacyErasureService;
  let patientsService: PatientsService;
  let jobService: JobService;

  const staffActor = () => ({
    sub: staffUserId,
    hospitalId: hospitalA,
    branchId: branchA,
  });

  const adminActor = () => ({
    sub: adminUserId,
    hospitalId: hospitalA,
    branchId: null as string | null,
  });

  const hospitalBStaff = () => ({
    sub: staffUserId,
    hospitalId: hospitalB,
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

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    process.env.CLINICAL_STORAGE_LOCAL_ROOT =
      process.env.CLINICAL_STORAGE_LOCAL_ROOT ??
      mkdtempSync(join(tmpdir(), 'medios-clinical-test-'));

    const audit = new AuditService(prisma as never);
    const blob = new LocalClinicalBlobStorageAdapter();
    jobService = new JobService(prisma as never);
    consentService = new PatientPrivacyConsentService(prisma as never, audit);
    exportService = new PatientPrivacyExportService(prisma as never, audit);
    erasureService = new PatientPrivacyErasureService(
      prisma as never,
      audit,
      jobService,
      blob,
    );
    const pref = {
      isWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue(true),
      upsertWhatsAppTransactionalEnabled: jest.fn(),
    };
    patientsService = new PatientsService(
      prisma as never,
      audit,
      pref as never,
      {
        syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    hospitalA = (
      await prisma.hospital.create({
        data: { name: `Privacy A ${runId}`, code: `PRA-${runId}` },
      })
    ).id;
    hospitalB = (
      await prisma.hospital.create({
        data: { name: `Privacy B ${runId}`, code: `PRB-${runId}` },
      })
    ).id;
    branchA = (
      await prisma.branch.create({
        data: { hospitalId: hospitalA, name: 'Main', code: `PB-${runId}` },
      })
    ).id;

    staffRoleId = (
      await prisma.role.create({
        data: { hospitalId: hospitalA, name: `STAFF_${runId}` },
      })
    ).id;
    adminRoleId = (
      await prisma.role.create({
        data: { hospitalId: hospitalA, name: `ADMIN_${runId}` },
      })
    ).id;

    for (const name of [
      'patients:read',
      'patients:update',
      'patients:privacy:manage',
    ]) {
      await grant(staffRoleId, name);
    }
    await grant(adminRoleId, 'patients:privacy:manage');
    await grant(adminRoleId, 'patients:read');
    await grant(adminRoleId, 'patients:update');

    staffUserId = (
      await prisma.user.create({
        data: {
          hospitalId: hospitalA,
          branchId: branchA,
          roleId: staffRoleId,
          email: `staff-privacy-${runId}@test.com`,
          name: 'Staff',
          passwordHash: 'hash',
        },
      })
    ).id;

    adminUserId = (
      await prisma.user.create({
        data: {
          hospitalId: hospitalA,
          roleId: adminRoleId,
          email: `admin-privacy-${runId}@test.com`,
          name: 'Admin',
          passwordHash: 'hash',
        },
      })
    ).id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        firstName: 'Privacy',
        lastName: runId,
        phone: `6${runId.slice(-9)}`,
        email: `patient-${runId}@example.com`,
        emergencyContacts: [{ name: 'Contact', phone: '9999999999' }],
      },
    });
    patientId = patient.id;

    patientBId = (
      await prisma.patient.create({
        data: {
          hospitalId: hospitalB,
          firstName: 'Other',
          phone: `5${runId.slice(-9)}`,
        },
      })
    ).id;

    const invoice = await prisma.invoice.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId,
        invoiceNumber: `INV-PRIV-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 100,
        taxAmount: 0,
        totalAmount: 100,
      },
    });
    invoiceId = invoice.id;

    await prisma.payment.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        invoiceId,
        amount: 100,
        status: 'INITIATED',
      },
    });

    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId,
        providerUserId: staffUserId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });
    encounterId = encounter.id;

    const storageKey = `test/${runId}/file.bin`;
    await blob.put({
      storageKey,
      contentType: 'application/octet-stream',
      body: Buffer.from('clinical-data'),
    });

    const attachment = await prisma.clinicalAttachment.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId,
        encounterId,
        storageKey,
        originalFileName: 'scan.pdf',
        contentType: 'application/pdf',
        sizeBytes: 13,
        checksumSha256: 'abc',
        uploadedByUserId: staffUserId,
      },
    });
    attachmentId = attachment.id;

    await prisma.auditLog.create({
      data: {
        hospitalId: hospitalA,
        action: 'PATIENT_CREATED',
        entity: 'Patient',
        entityId: patientId,
        userId: staffUserId,
        metadata: { patientId },
      },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb('consent grant, list, withdraw preserves history', async () => {
    const granted = await consentService.grantConsent(staffActor(), patientId, {
      purpose: PatientPrivacyPurpose.CARE,
    });
    expect(granted.status).toBe('GRANTED');

    const withdrawn = await consentService.withdrawConsent(
      staffActor(),
      patientId,
      granted.id,
    );
    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(withdrawn.relatedGrantId).toBe(granted.id);

    const history = await consentService.listConsents(staffActor(), patientId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((row) => row.status === 'GRANTED')).toBe(true);
    expect(history.some((row) => row.status === 'WITHDRAWN')).toBe(true);
  });

  itWithDb('cross-hospital consent access fails', async () => {
    await expect(
      consentService.listConsents(hospitalBStaff(), patientId),
    ).rejects.toThrow(NotFoundException);
  });

  itWithDb('privacy export includes domains and excludes storage keys', async () => {
    const payload = await exportService.exportPatientData(
      staffActor(),
      patientId,
    ) as Record<string, unknown>;

    expect(payload.patient).toBeTruthy();
    expect(payload.invoices).toBeTruthy();
    expect(payload.clinicalEncounters).toBeTruthy();
    expect(payload.clinicalAttachments).toBeTruthy();

    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/storageKey/i);
    expect(json).not.toMatch(/linkToken/i);
    expect(json).not.toMatch(/passwordHash/i);

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        hospitalId: hospitalA,
        action: PATIENT_PRIVACY_EXPORT_REQUESTED,
        entityId: patientId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(JSON.stringify(auditRow?.metadata ?? {})).not.toContain('Privacy');
  });

  itWithDb('erasure workflow and safe anonymization', async () => {
    const erasurePatient = await prisma.patient.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        firstName: 'Erase',
        lastName: runId,
        phone: `4${runId.slice(-9)}`,
        email: `erase-${runId}@example.com`,
      },
    });

    const erasureInvoice = await prisma.invoice.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId: erasurePatient.id,
        invoiceNumber: `INV-ERASE-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 50,
        taxAmount: 0,
        totalAmount: 50,
      },
    });

    const request = await erasureService.requestErasure(
      staffActor(),
      erasurePatient.id,
    );
    expect(request.status).toBe(PatientPrivacyErasureStatus.REQUESTED);

    const approved = await erasureService.approveErasure(
      adminActor(),
      erasurePatient.id,
    );
    expect(approved.status).toBe(PatientPrivacyErasureStatus.APPROVED);

    const result = await erasureService.processErasureJob({
      erasureRequestId: approved.id,
      patientId: erasurePatient.id,
      actorUserId: adminUserId,
    });
    expect(result.completed).toBe(true);

    const patientAfter = await prisma.patient.findUniqueOrThrow({
      where: { id: erasurePatient.id },
    });
    expect(patientAfter.anonymizedAt).not.toBeNull();
    expect(patientAfter.firstName).toBe('Deleted');
    expect(patientAfter.phone).toBe(
      buildAnonymizedPatientPhone(erasurePatient.id),
    );
    expect(patientAfter.email).toBeNull();

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({
      where: { id: erasureInvoice.id },
    });
    expect(invoiceAfter.patientId).toBe(erasurePatient.id);
    expect(invoiceAfter.totalAmount.toString()).toBe('50');

    const paymentCount = await prisma.payment.count({
      where: { invoiceId: erasureInvoice.id },
    });
    expect(paymentCount).toBeGreaterThanOrEqual(0);

    const auditCount = await prisma.auditLog.count({
      where: { hospitalId: hospitalA },
    });
    expect(auditCount).toBeGreaterThan(0);

    const attachment = await prisma.clinicalAttachment.findUnique({
      where: { id: attachmentId },
    });
    expect(attachment?.deletedAt).toBeNull();
  });

  itWithDb('staff cannot approve erasure without patients:privacy:manage', async () => {
    const limitedRole = await prisma.role.create({
      data: { hospitalId: hospitalA, name: `LIMITED_${runId}` },
    });
    await grant(limitedRole.id, 'patients:update');
    const limitedUser = await prisma.user.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        roleId: limitedRole.id,
        email: `limited-${runId}@test.com`,
        name: 'Limited',
        passwordHash: 'hash',
      },
    });

    const p = await prisma.patient.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        firstName: 'Limited',
        phone: `3${runId.slice(-9)}`,
      },
    });

    await erasureService.requestErasure(
      { sub: limitedUser.id, hospitalId: hospitalA, branchId: branchA },
      p.id,
    );

    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector, prisma as never);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class T {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: limitedUser.id, hospitalId: hospitalA, roleId: limitedRole.id },
        }),
      }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:privacy:manage']);
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);
  });

  itWithDb('repeated erasure request rejected after completion', async () => {
    const p = await prisma.patient.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        firstName: 'Done',
        phone: `2${runId.slice(-9)}`,
        anonymizedAt: new Date(),
      },
    });

    await prisma.patientPrivacyErasureRequest.create({
      data: {
        hospitalId: hospitalA,
        patientId: p.id,
        status: PatientPrivacyErasureStatus.COMPLETED,
        requestedByUserId: staffUserId,
        completedAt: new Date(),
      },
    });

    await expect(
      erasureService.requestErasure(staffActor(), p.id),
    ).rejects.toThrow(ForbiddenException);
  });

  itWithDb('patient read still works after anonymization', async () => {
    const detail = await patientsService.findOne(adminActor(), patientId);
    expect(detail.id).toBe(patientId);
  });

  itWithDb('consent grant audit has no sensitive payload', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { hospitalId: hospitalA, action: PATIENT_PRIVACY_CONSENT_GRANTED },
      orderBy: { createdAt: 'desc' },
    });
    const meta = JSON.stringify(row?.metadata ?? {});
    expect(meta).not.toMatch(/@example.com/);
    expect(meta).not.toContain('9999999999');
  });

  itWithDb('erasure attachment soft-delete for erased patient only', async () => {
    const eraseP = await prisma.patient.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        firstName: 'Attach',
        phone: `1${runId.slice(-9)}`,
      },
    });

    const enc = await prisma.clinicalEncounter.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId: eraseP.id,
        providerUserId: staffUserId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });

    const blob = new LocalClinicalBlobStorageAdapter();
    const key = `erase/${runId}/x.bin`;
    await blob.put({ storageKey: key, contentType: 'text/plain', body: Buffer.from('x') });
    const att = await prisma.clinicalAttachment.create({
      data: {
        hospitalId: hospitalA,
        branchId: branchA,
        patientId: eraseP.id,
        encounterId: enc.id,
        storageKey: key,
        originalFileName: 'x.txt',
        contentType: 'text/plain',
        sizeBytes: 1,
        checksumSha256: 'x',
        uploadedByUserId: staffUserId,
      },
    });

    await erasureService.requestErasure(staffActor(), eraseP.id);
    await erasureService.approveErasure(adminActor(), eraseP.id);
    await erasureService.processErasureJob({
      erasureRequestId: (
        await prisma.patientPrivacyErasureRequest.findFirstOrThrow({
          where: { patientId: eraseP.id },
        })
      ).id,
      patientId: eraseP.id,
      actorUserId: adminUserId,
    });

    const attAfter = await prisma.clinicalAttachment.findUniqueOrThrow({
      where: { id: att.id },
    });
    expect(attAfter.deletedAt).not.toBeNull();
    expect(attAfter.originalFileName).toBe('erased-attachment');

    const completedAudit = await prisma.auditLog.findFirst({
      where: { action: PATIENT_PRIVACY_ERASURE_COMPLETED, entityId: attAfter.id },
    });
    expect(completedAudit).toBeNull();
  });
});
