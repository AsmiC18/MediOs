import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  PrismaClient,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { AuditService } from '../../audit/audit.service';
import { UnavailableDrugInteractionAdapter } from '../adapters/unavailable-drug-interaction.adapter';
import { ClinicalService } from '../clinical.service';
import { Icd10Service } from '../icd10/icd10.service';
import { ClinicalDrugService } from '../drugs/clinical-drug.service';
import { ClinicalSafetyPolicyService } from '../safety/clinical-safety-policy.service';
import { PrescriptionSafetyService } from '../safety/prescription-safety.service';
import { JobService } from '../../jobs/job.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { ClinicalPrescriptionOutboxService } from '../events/clinical-prescription-outbox.service';
import { ClinicalAttachmentService } from './clinical-attachment.service';
import type { ClinicalUploadedFile } from './types/clinical-uploaded-file.type';
import {
  ClinicalBlobStorageAdapter,
  ClinicalBlobPutInput,
} from './storage/clinical-blob-storage.adapter';
import { LocalClinicalBlobStorageAdapter } from './storage/local-clinical-blob-storage.adapter';

const SAMPLE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
);

function multerFile(
  buffer: Buffer,
  originalname: string,
  mimetype = 'application/pdf',
): ClinicalUploadedFile {
  return {
    originalname,
    mimetype,
    size: buffer.length,
    buffer,
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('Clinical attachments (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let storageRoot: string;
  let attachmentService: ClinicalAttachmentService;
  let clinicalService: ClinicalService;
  let blobAdapter: LocalClinicalBlobStorageAdapter;

  let hospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let roleId: string;
  let userId: string;
  let branchUserId: string;
  let otherHospitalUserId: string;
  let otherHospitalId: string;
  let patientId: string;
  let encounterId: string;
  let otherBranchEncounterId: string;

  const hospitalWideUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchScopedUser = () => ({
    sub: branchUserId,
    hospitalId,
    branchId,
  });

  const otherHospitalUser = () => ({
    sub: otherHospitalUserId,
    hospitalId: otherHospitalId,
    branchId: null as string | null,
  });

  beforeAll(async () => {
    storageRoot = await mkdtemp(
      path.join(os.tmpdir(), 'medios-clinical-integ-'),
    );
    process.env.CLINICAL_STORAGE_LOCAL_ROOT = storageRoot;
    process.env.CLINICAL_STORAGE_MAX_FILE_SIZE_BYTES = String(1024 * 1024);

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const auditService = new AuditService(prisma as never);
    blobAdapter = new LocalClinicalBlobStorageAdapter();
    attachmentService = new ClinicalAttachmentService(
      prisma as never,
      auditService,
      blobAdapter,
    );

    const clinicalDrugService = new ClinicalDrugService(prisma as never);
    const policyService = new ClinicalSafetyPolicyService(prisma as never);
    const prescriptionSafetyService = new PrescriptionSafetyService(
      prisma as never,
      clinicalDrugService,
      policyService,
      new UnavailableDrugInteractionAdapter(),
    );
    const jobService = new JobService(prisma as never);
    const domainEventOutboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const clinicalPrescriptionOutboxService = new ClinicalPrescriptionOutboxService(
      domainEventOutboxService,
    );
    clinicalService = new ClinicalService(
      prisma as never,
      auditService,
      prescriptionSafetyService,
      clinicalPrescriptionOutboxService,
      new Icd10Service(prisma as never),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `Att ${runId}`, code: `ATT-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `Other ${runId}`, code: `OTH-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const otherBranch = await prisma.branch.create({
      data: { hospitalId, name: 'Satellite', code: `SAT-${runId}` },
    });
    otherBranchId = otherBranch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });
    roleId = role.id;

    for (const name of ['clinical:manage', 'clinical:read']) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
      await prisma.rolePermission.create({
        data: { roleId, permissionId: permission.id },
      });
    }

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'Clinician',
        email: `att-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const branchUser = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'Branch Clinician',
        email: `branch-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    branchUserId = branchUser.id;

    const otherRole = await prisma.role.create({
      data: { hospitalId: otherHospitalId, name: `OtherRole-${runId}` },
    });
    for (const name of ['clinical:manage', 'clinical:read']) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { name },
      });
      await prisma.rolePermission.create({
        data: { roleId: otherRole.id, permissionId: permission.id },
      });
    }

    const otherUser = await prisma.user.create({
      data: {
        hospitalId: otherHospitalId,
        roleId: otherRole.id,
        name: 'Other Hosp',
        email: `other-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    otherHospitalUserId = otherUser.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });
    encounterId = encounter.id;

    const otherBranchEncounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId: otherBranchId,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });
    otherBranchEncounterId = otherBranchEncounter.id;
  });

  afterAll(async () => {
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
    }
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('uploads successfully and persists metadata with checksum', async () => {
    if (!dbAvailable) {
      return;
    }

    const file = multerFile(SAMPLE_PDF, 'lab-report.pdf');
    const expectedChecksum = createHash('sha256').update(SAMPLE_PDF).digest('hex');

    const meta = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      file,
      { description: 'Lab', category: 'LAB' },
    );

    expect(meta.encounterId).toBe(encounterId);
    expect(meta.originalFileName).toBe('lab-report.pdf');
    expect(meta.contentType).toBe('application/pdf');
    expect(meta.checksumSha256).toBe(expectedChecksum);
    expect(meta.sizeBytes).toBe(String(SAMPLE_PDF.length));
    expect(meta).not.toHaveProperty('storageKey');

    const row = await prisma.clinicalAttachment.findUniqueOrThrow({
      where: { id: meta.id },
    });
    expect(row.storageKey).toContain(encounterId);
    expect(row.storageKey).toContain(meta.id);

    const onDisk = await readFile(
      path.join(storageRoot, ...row.storageKey.split('/')),
    );
    expect(onDisk.equals(SAMPLE_PDF)).toBe(true);
  });

  it('downloads with correct content type and filename', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'download-me.pdf'),
      {},
    );

    const content = await attachmentService.getAttachmentContent(
      hospitalWideUser(),
      uploaded.id,
    );

    expect(content.contentType).toBe('application/pdf');
    expect(content.originalFileName).toBe('download-me.pdf');
    const bytes = await streamToBuffer(content.stream);
    expect(bytes.equals(SAMPLE_PDF)).toBe(true);
  });

  it('lists attachments and excludes soft-deleted rows', async () => {
    if (!dbAvailable) {
      return;
    }

    const keep = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'keep.pdf'),
      {},
    );
    const doomed = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'delete-me.pdf'),
      {},
    );

    await attachmentService.softDeleteAttachment(hospitalWideUser(), doomed.id);

    const list = await attachmentService.listForEncounter(
      hospitalWideUser(),
      encounterId,
    );
    const ids = list.map((a) => a.id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(doomed.id);
  });

  it('soft-deletes and blocks future download', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'soft-delete.pdf'),
      {},
    );

    await attachmentService.softDeleteAttachment(hospitalWideUser(), uploaded.id);

    await expect(
      attachmentService.getAttachmentContent(hospitalWideUser(), uploaded.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies branch-scoped user upload on another branch encounter', async () => {
    if (!dbAvailable) {
      return;
    }

    await expect(
      attachmentService.uploadForEncounter(
        branchScopedUser(),
        otherBranchEncounterId,
        multerFile(SAMPLE_PDF, 'x.pdf'),
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies branch-scoped user download for other branch attachment', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      otherBranchEncounterId,
      multerFile(SAMPLE_PDF, 'other-branch.pdf'),
      {},
    );

    await expect(
      attachmentService.getAttachmentContent(branchScopedUser(), uploaded.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for wrong hospital access without streaming blob', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'tenant.pdf'),
      {},
    );

    const getSpy = jest.spyOn(blobAdapter, 'get');

    await expect(
      attachmentService.getAttachmentContent(otherHospitalUser(), uploaded.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(getSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });

  it('returns not found for nonexistent attachment', async () => {
    if (!dbAvailable) {
      return;
    }

    await expect(
      attachmentService.getAttachmentContent(
        hospitalWideUser(),
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects empty files', async () => {
    if (!dbAvailable) {
      return;
    }

    await expect(
      attachmentService.uploadForEncounter(
        hospitalWideUser(),
        encounterId,
        multerFile(Buffer.alloc(0), 'empty.pdf'),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized files', async () => {
    if (!dbAvailable) {
      return;
    }

    const huge = Buffer.alloc(2 * 1024 * 1024, 0x25);
    huge.write('%PDF-1.4', 0);

    await expect(
      attachmentService.uploadForEncounter(
        hospitalWideUser(),
        encounterId,
        multerFile(huge, 'big.pdf'),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sanitizes unsafe filenames', async () => {
    if (!dbAvailable) {
      return;
    }

    const meta = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, '../../etc/passwd.pdf'),
      {},
    );

    expect(meta.originalFileName).toBe('passwd.pdf');
    expect(meta.originalFileName).not.toContain('..');
  });

  it('does not create DB row when storage put fails', async () => {
    if (!dbAvailable) {
      return;
    }

    const auditService = new AuditService(prisma as never);
    const failingAdapter: ClinicalBlobStorageAdapter = {
      put: async (_input: ClinicalBlobPutInput) => {
        throw new Error('storage down');
      },
      get: async () => {
        throw new NotFoundException();
      },
      delete: async () => undefined,
    };

    const svc = new ClinicalAttachmentService(
      prisma as never,
      auditService,
      failingAdapter,
    );

    const before = await prisma.clinicalAttachment.count({ where: { hospitalId } });

    await expect(
      svc.uploadForEncounter(
        hospitalWideUser(),
        encounterId,
        multerFile(SAMPLE_PDF, 'fail.pdf'),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const after = await prisma.clinicalAttachment.count({ where: { hospitalId } });
    expect(after).toBe(before);
  });

  it('compensates storage when DB create fails', async () => {
    if (!dbAvailable) {
      return;
    }

    const auditService = new AuditService(prisma as never);
    const svc = new ClinicalAttachmentService(
      prisma as never,
      auditService,
      blobAdapter,
    );

    const createSpy = jest
      .spyOn(prisma.clinicalAttachment, 'create')
      .mockRejectedValueOnce(new Error('db unavailable'));
    const deleteSpy = jest.spyOn(blobAdapter, 'delete');

    await expect(
      svc.uploadForEncounter(
        hospitalWideUser(),
        encounterId,
        multerFile(SAMPLE_PDF, 'compensate.pdf'),
        {},
      ),
    ).rejects.toThrow('db unavailable');

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    deleteSpy.mockRestore();

    const orphanRows = await prisma.clinicalAttachment.findMany({
      where: {
        hospitalId,
        originalFileName: 'compensate.pdf',
      },
    });
    expect(orphanRows).toHaveLength(0);
  });

  it('writes upload, download, and delete audit events', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'audit.pdf'),
      { category: 'OTHER' },
    );

    const uploadAudit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CLINICAL_ATTACHMENT_UPLOADED',
        entityId: uploaded.id,
      },
    });
    expect(uploadAudit).not.toBeNull();

    await attachmentService.getAttachmentContent(hospitalWideUser(), uploaded.id);

    const downloadAudit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CLINICAL_ATTACHMENT_DOWNLOADED',
        entityId: uploaded.id,
      },
    });
    expect(downloadAudit).not.toBeNull();

    await attachmentService.softDeleteAttachment(hospitalWideUser(), uploaded.id);

    const deleteAudit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CLINICAL_ATTACHMENT_DELETED',
        entityId: uploaded.id,
      },
    });
    expect(deleteAudit).not.toBeNull();
  });

  it('audits access denied without leaking blob content', async () => {
    if (!dbAvailable) {
      return;
    }

    const uploaded = await attachmentService.uploadForEncounter(
      hospitalWideUser(),
      encounterId,
      multerFile(SAMPLE_PDF, 'denied.pdf'),
      {},
    );

    await expect(
      attachmentService.getAttachmentContent(otherHospitalUser(), uploaded.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const denied = await prisma.auditLog.findFirst({
      where: {
        hospitalId: otherHospitalId,
        action: 'CLINICAL_ATTACHMENT_ACCESS_DENIED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(denied).not.toBeNull();
  });

  it('existing clinical prescription flow still works', async () => {
    if (!dbAvailable) {
      return;
    }

    const rx = await clinicalService.createPrescription(
      { sub: userId, hospitalId, branchId: null, roleId },
      encounterId,
      { items: [{ medicationName: 'Paracetamol', quantity: 10 }] },
    );

    expect(rx.id).toBeDefined();
  });
});
