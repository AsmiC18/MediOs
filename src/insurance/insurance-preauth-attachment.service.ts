import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InsurancePreauthAttachmentType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CLINICAL_BLOB_STORAGE_ADAPTER,
  type ClinicalBlobStorageAdapter,
} from '../clinical/attachments/storage/clinical-blob-storage.adapter';
import { getClinicalStorageMaxFileSizeBytes } from '../clinical/attachments/clinical-attachment.config';
import type { ClinicalUploadedFile } from '../clinical/attachments/types/clinical-uploaded-file.type';
import { validateClinicalUploadFile } from '../clinical/attachments/utils/clinical-attachment-validation.util';
import { buildInsurancePreauthAttachmentStorageKey } from './preauth-attachment.config';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const PREAUTH_ATTACHMENT_UPLOAD = 'INSURANCE_PREAUTH_ATTACHMENT_UPLOAD';
const PREAUTH_ATTACHMENT_DELETE = 'INSURANCE_PREAUTH_ATTACHMENT_DELETE';

@Injectable()
export class InsurancePreauthAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(CLINICAL_BLOB_STORAGE_ADAPTER)
    private readonly blobStorage: ClinicalBlobStorageAdapter,
  ) {}

  async list(user: StaffUser, preauthId: string) {
    const preauth = await this.findOwnedPreauth(user, preauthId);
    return this.prisma.insurancePreauthAttachment.findMany({
      where: {
        hospitalId: user.hospitalId,
        preauthId: preauth.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        attachmentType: true,
        originalFileName: true,
        contentType: true,
        sizeBytes: true,
        uploadedByUserId: true,
        createdAt: true,
      },
    });
  }

  async upload(
    user: StaffUser,
    preauthId: string,
    file: ClinicalUploadedFile | undefined,
    input: { attachmentType?: InsurancePreauthAttachmentType },
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    if (file.size > getClinicalStorageMaxFileSizeBytes()) {
      throw new BadRequestException('file exceeds maximum size');
    }

    const preauth = await this.findOwnedPreauth(user, preauthId);
    const validated = validateClinicalUploadFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    });

    const attachmentId = randomUUID();
    const storageKey = buildInsurancePreauthAttachmentStorageKey({
      hospitalId: preauth.hospitalId,
      preauthId: preauth.id,
      attachmentId,
    });

    await this.blobStorage.put({
      storageKey,
      contentType: validated.contentType,
      body: validated.buffer,
    });

    const row = await this.prisma.insurancePreauthAttachment.create({
      data: {
        id: attachmentId,
        hospitalId: preauth.hospitalId,
        branchId: preauth.branchId,
        preauthId: preauth.id,
        attachmentType: input.attachmentType ?? InsurancePreauthAttachmentType.OTHER,
        storageKey,
        originalFileName: validated.originalFileName,
        contentType: validated.contentType,
        sizeBytes: validated.sizeBytes,
        checksumSha256: validated.checksumSha256,
        uploadedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: PREAUTH_ATTACHMENT_UPLOAD,
      entity: 'InsurancePreauthAttachment',
      entityId: row.id,
      hospitalId: user.hospitalId,
      branchId: preauth.branchId,
      userId: user.sub,
      metadata: { preauthId: preauth.id, attachmentType: row.attachmentType },
    });

    return {
      id: row.id,
      attachmentType: row.attachmentType,
      originalFileName: row.originalFileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes.toString(),
      createdAt: row.createdAt,
    };
  }

  async getContent(user: StaffUser, preauthId: string, attachmentId: string) {
    const attachment = await this.findOwnedAttachment(user, preauthId, attachmentId);
    const blob = await this.blobStorage.get(attachment.storageKey);
    return {
      stream: blob.stream,
      contentType: attachment.contentType,
      originalFileName: attachment.originalFileName,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async softDelete(user: StaffUser, preauthId: string, attachmentId: string) {
    const attachment = await this.findOwnedAttachment(user, preauthId, attachmentId);
    const updated = await this.prisma.insurancePreauthAttachment.update({
      where: { id: attachment.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: PREAUTH_ATTACHMENT_DELETE,
      entity: 'InsurancePreauthAttachment',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: attachment.branchId,
      userId: user.sub,
      metadata: { preauthId },
    });

    return { id: updated.id, deletedAt: updated.deletedAt };
  }

  private async findOwnedPreauth(user: StaffUser, preauthId: string) {
    const preauth = await this.prisma.insurancePreAuthorization.findFirst({
      where: { id: preauthId, hospitalId: user.hospitalId },
    });
    if (!preauth) {
      throw new NotFoundException('Pre-authorization not found');
    }
    if (preauth.branchId) {
      assertBranchAccess(user, preauth.branchId);
    }
    return preauth;
  }

  private async findOwnedAttachment(
    user: StaffUser,
    preauthId: string,
    attachmentId: string,
  ) {
    await this.findOwnedPreauth(user, preauthId);
    const attachment = await this.prisma.insurancePreauthAttachment.findFirst({
      where: {
        id: attachmentId,
        preauthId,
        hospitalId: user.hospitalId,
        deletedAt: null,
      },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }
}
