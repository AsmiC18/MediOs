import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalAttachmentCategory, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../audit/audit.service';
import { assertBranchAccess } from '../../common/auth/branch-scope.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildClinicalAttachmentStorageKey,
} from './clinical-attachment.config';
import type { ClinicalBlobStorageAdapter } from './storage/clinical-blob-storage.adapter';
import { CLINICAL_BLOB_STORAGE_ADAPTER } from './storage/clinical-blob-storage.adapter';
import type { ClinicalUploadedFile } from './types/clinical-uploaded-file.type';
import { validateClinicalUploadFile } from './utils/clinical-attachment-validation.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export type ClinicalAttachmentMetadataResponse = {
  id: string;
  encounterId: string;
  patientId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: string;
  checksumSha256: string;
  category: ClinicalAttachmentCategory | null;
  description: string | null;
  uploadedByUserId: string;
  createdAt: Date;
};

@Injectable()
export class ClinicalAttachmentService {
  private readonly logger = new Logger(ClinicalAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(CLINICAL_BLOB_STORAGE_ADAPTER)
    private readonly blobStorage: ClinicalBlobStorageAdapter,
  ) {}

  async uploadForEncounter(
    user: AuthenticatedUser,
    encounterId: string,
    file: ClinicalUploadedFile | undefined,
    input: { description?: string; category?: ClinicalAttachmentCategory },
  ): Promise<ClinicalAttachmentMetadataResponse> {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const encounter = await this.findOwnedEncounter(user, encounterId);

    const validated = validateClinicalUploadFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    });

    const attachmentId = randomUUID();
    const storageKey = buildClinicalAttachmentStorageKey({
      hospitalId: encounter.hospitalId,
      encounterId: encounter.id,
      attachmentId,
    });

    try {
      await this.blobStorage.put({
        storageKey,
        contentType: validated.contentType,
        body: validated.buffer,
      });
    } catch {
      throw new BadRequestException('Failed to store clinical attachment');
    }

    try {
      const created = await this.prisma.clinicalAttachment.create({
        data: {
          id: attachmentId,
          hospitalId: encounter.hospitalId,
          branchId: encounter.branchId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          storageKey,
          originalFileName: validated.originalFileName,
          contentType: validated.contentType,
          sizeBytes: validated.sizeBytes,
          checksumSha256: validated.checksumSha256,
          description: input.description?.trim() || null,
          category: input.category ?? null,
          uploadedByUserId: user.sub,
        },
      });

      await this.auditService.log({
        action: 'CLINICAL_ATTACHMENT_UPLOADED',
        entity: 'ClinicalAttachment',
        entityId: created.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: {
          encounterId: encounter.id,
          patientId: encounter.patientId,
          sizeBytes: created.sizeBytes.toString(),
          contentType: created.contentType,
          category: created.category,
          checksumSha256: created.checksumSha256,
        },
      });

      return this.toMetadataResponse(created);
    } catch (error) {
      try {
        await this.blobStorage.delete(storageKey);
      } catch (deleteError) {
        this.logger.error(
          `Compensating delete failed for clinical attachment blob (storageKey=${storageKey}): ${
            deleteError instanceof Error ? deleteError.message : 'unknown'
          }`,
        );
      }
      throw error;
    }
  }

  async listForEncounter(
    user: AuthenticatedUser,
    encounterId: string,
  ): Promise<ClinicalAttachmentMetadataResponse[]> {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    const rows = await this.prisma.clinicalAttachment.findMany({
      where: {
        hospitalId: user.hospitalId,
        encounterId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.auditService.log({
      action: 'CLINICAL_ATTACHMENT_LIST_READ',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: {
        patientId: encounter.patientId,
        attachmentCount: rows.length,
      },
    });

    return rows.map((row) => this.toMetadataResponse(row));
  }

  async getAttachmentContent(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.findActiveAttachment(user, attachmentId);

    const blob = await this.blobStorage.get(attachment.storageKey);

    await this.auditService.log({
      action: 'CLINICAL_ATTACHMENT_DOWNLOADED',
      entity: 'ClinicalAttachment',
      entityId: attachment.id,
      hospitalId: user.hospitalId,
      branchId: attachment.branchId,
      userId: user.sub,
      metadata: {
        encounterId: attachment.encounterId,
        patientId: attachment.patientId,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes.toString(),
      },
    });

    return {
      stream: blob.stream,
      contentType: attachment.contentType,
      originalFileName: attachment.originalFileName,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async softDeleteAttachment(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.findActiveAttachment(user, attachmentId);

    const updated = await this.prisma.clinicalAttachment.update({
      where: { id: attachment.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'CLINICAL_ATTACHMENT_DELETED',
      entity: 'ClinicalAttachment',
      entityId: attachment.id,
      hospitalId: user.hospitalId,
      branchId: attachment.branchId,
      userId: user.sub,
      metadata: {
        encounterId: attachment.encounterId,
        patientId: attachment.patientId,
        softDelete: true,
      },
    });

    return this.toMetadataResponse(updated);
  }

  private async findOwnedEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter || encounter.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Clinical encounter not found');
    }

    try {
      assertBranchAccess(user, encounter.branchId);
    } catch {
      await this.auditAccessDenied(user, {
        encounterId,
        reason: 'BRANCH_ACCESS_DENIED',
      });
      throw new ForbiddenException('Access to this branch is not permitted');
    }

    return encounter;
  }

  private async findActiveAttachment(user: AuthenticatedUser, attachmentId: string) {
    const attachment = await this.prisma.clinicalAttachment.findUnique({
      where: { id: attachmentId },
      include: { encounter: true },
    });

    if (!attachment || attachment.hospitalId !== user.hospitalId) {
      await this.auditAccessDenied(user, {
        attachmentId,
        reason: 'ATTACHMENT_NOT_FOUND',
      });
      throw new NotFoundException('Clinical attachment not found');
    }

    if (attachment.deletedAt) {
      await this.auditAccessDenied(user, {
        attachmentId,
        reason: 'ATTACHMENT_DELETED',
      });
      throw new NotFoundException('Clinical attachment not found');
    }

    try {
      assertBranchAccess(user, attachment.branchId);
    } catch {
      await this.auditAccessDenied(user, {
        attachmentId,
        reason: 'BRANCH_ACCESS_DENIED',
      });
      throw new ForbiddenException('Access to this branch is not permitted');
    }

    if (attachment.encounter.hospitalId !== user.hospitalId) {
      await this.auditAccessDenied(user, {
        attachmentId,
        reason: 'ENCOUNTER_HOSPITAL_MISMATCH',
      });
      throw new NotFoundException('Clinical attachment not found');
    }

    return attachment;
  }

  private async auditAccessDenied(
    user: AuthenticatedUser,
    metadata: Record<string, string | undefined>,
  ): Promise<void> {
    await this.auditService.log({
      action: 'CLINICAL_ATTACHMENT_ACCESS_DENIED',
      entity: 'ClinicalAttachment',
      entityId: metadata.attachmentId ?? metadata.encounterId ?? null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? null,
      userId: user.sub,
      metadata,
    });
  }

  private toMetadataResponse(
    row: Prisma.ClinicalAttachmentGetPayload<object>,
  ): ClinicalAttachmentMetadataResponse {
    return {
      id: row.id,
      encounterId: row.encounterId,
      patientId: row.patientId,
      originalFileName: row.originalFileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes.toString(),
      checksumSha256: row.checksumSha256,
      category: row.category,
      description: row.description,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt,
    };
  }
}
