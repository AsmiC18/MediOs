import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  PatientPrivacyErasureStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CLINICAL_BLOB_STORAGE_ADAPTER } from '../clinical/attachments/storage/clinical-blob-storage.adapter';
import type { ClinicalBlobStorageAdapter } from '../clinical/attachments/storage/clinical-blob-storage.adapter';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { RejectPatientPrivacyErasureDto } from './dto/reject-patient-privacy-erasure.dto';
import {
  PATIENT_PRIVACY_ERASURE_APPROVED,
  PATIENT_PRIVACY_ERASURE_COMPLETED,
  PATIENT_PRIVACY_ERASURE_REJECTED,
  PATIENT_PRIVACY_ERASURE_REQUESTED,
} from './patient-privacy-audit.actions';
import {
  assertPatientNotAnonymized,
  findOwnedPatientForPrivacy,
  PatientPrivacyActor,
  resolvePrivacyAuditUserId,
  resolvePrivacyRecordedByUserId,
} from './patient-privacy-access.util';
import {
  ANONYMIZED_FIRST_NAME,
  ANONYMIZED_LAST_NAME,
  buildAnonymizedPatientPhone,
} from './patient-privacy-anonymization.util';

const OPEN_ERASURE_STATUSES: PatientPrivacyErasureStatus[] = [
  PatientPrivacyErasureStatus.REQUESTED,
  PatientPrivacyErasureStatus.APPROVED,
  PatientPrivacyErasureStatus.PROCESSING,
];

const PII_FIELD_HISTORY_NAMES = new Set([
  'phone',
  'firstName',
  'lastName',
  'email',
  'dateOfBirth',
  'abhaId',
  'emergencyContacts',
]);

@Injectable()
export class PatientPrivacyErasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly jobService: JobService,
    @Optional()
    @Inject(CLINICAL_BLOB_STORAGE_ADAPTER)
    private readonly blobStorage?: ClinicalBlobStorageAdapter,
  ) {}

  async getLatestErasureRequest(user: PatientPrivacyActor, patientId: string) {
    await findOwnedPatientForPrivacy(this.prisma, user, patientId);

    const request = await this.prisma.patientPrivacyErasureRequest.findFirst({
      where: { hospitalId: user.hospitalId, patientId },
      orderBy: { createdAt: 'desc' },
    });

    return request ? this.toErasureResponse(request) : null;
  }

  async requestErasure(user: PatientPrivacyActor, patientId: string) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );
    assertPatientNotAnonymized(patient);

    const existingOpen = await this.prisma.patientPrivacyErasureRequest.findFirst({
      where: {
        hospitalId: user.hospitalId,
        patientId,
        status: { in: OPEN_ERASURE_STATUSES },
      },
    });
    if (existingOpen) {
      throw new ConflictException('An erasure request is already in progress');
    }

    const completed = await this.prisma.patientPrivacyErasureRequest.findFirst({
      where: {
        hospitalId: user.hospitalId,
        patientId,
        status: PatientPrivacyErasureStatus.COMPLETED,
      },
    });
    if (completed) {
      throw new ConflictException('Patient erasure has already been completed');
    }

    const request = await this.prisma.patientPrivacyErasureRequest.create({
      data: {
        hospitalId: user.hospitalId,
        patientId,
        status: PatientPrivacyErasureStatus.REQUESTED,
        requestedByUserId: resolvePrivacyRecordedByUserId(user),
      },
    });

    await this.auditService.log({
      action: PATIENT_PRIVACY_ERASURE_REQUESTED,
      entity: 'PatientPrivacyErasureRequest',
      entityId: request.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: resolvePrivacyAuditUserId(user),
      metadata: { patientId, erasureRequestId: request.id },
    });

    return this.toErasureResponse(request);
  }

  async approveErasure(user: PatientPrivacyActor, patientId: string) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );

    const request = await this.findOpenRequest(
      user.hospitalId,
      patientId,
      PatientPrivacyErasureStatus.REQUESTED,
    );

    const updated = await this.prisma.patientPrivacyErasureRequest.update({
      where: { id: request.id },
      data: {
        status: PatientPrivacyErasureStatus.APPROVED,
        decidedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: PATIENT_PRIVACY_ERASURE_APPROVED,
      entity: 'PatientPrivacyErasureRequest',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: { patientId, erasureRequestId: updated.id },
    });

    await this.jobService.enqueue({
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      type: JOB_TYPES.PATIENT_PRIVACY_ERASURE,
      idempotencyKey: `patient.privacy.erasure:${patientId}:${updated.id}`,
      payload: {
        erasureRequestId: updated.id,
        patientId,
        actorUserId: user.sub,
      },
      maxAttempts: 5,
    });

    return this.toErasureResponse(updated);
  }

  async rejectErasure(
    user: PatientPrivacyActor,
    patientId: string,
    dto: RejectPatientPrivacyErasureDto,
  ) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );

    const request = await this.findOpenRequest(
      user.hospitalId,
      patientId,
      PatientPrivacyErasureStatus.REQUESTED,
    );

    const updated = await this.prisma.patientPrivacyErasureRequest.update({
      where: { id: request.id },
      data: {
        status: PatientPrivacyErasureStatus.REJECTED,
        decidedByUserId: user.sub,
        rejectionReason: dto.rejectionReason?.trim() || null,
      },
    });

    await this.auditService.log({
      action: PATIENT_PRIVACY_ERASURE_REJECTED,
      entity: 'PatientPrivacyErasureRequest',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: { patientId, erasureRequestId: updated.id },
    });

    return this.toErasureResponse(updated);
  }

  async processErasureJob(payload: {
    erasureRequestId: string;
    patientId: string;
    actorUserId: string;
  }) {
    const request = await this.prisma.patientPrivacyErasureRequest.findUnique({
      where: { id: payload.erasureRequestId },
    });

    if (!request) {
      throw new NotFoundException('Erasure request not found');
    }

    if (request.status === PatientPrivacyErasureStatus.COMPLETED) {
      return { skipped: true, reason: 'already_completed' };
    }

    if (
      request.status !== PatientPrivacyErasureStatus.APPROVED &&
      request.status !== PatientPrivacyErasureStatus.PROCESSING
    ) {
      throw new ConflictException('Erasure request is not approved for processing');
    }

    await this.prisma.patientPrivacyErasureRequest.update({
      where: { id: request.id },
      data: { status: PatientPrivacyErasureStatus.PROCESSING },
    });

    const attachmentKeys = await this.prisma.clinicalAttachment.findMany({
      where: {
        hospitalId: request.hospitalId,
        patientId: request.patientId,
        deletedAt: null,
      },
      select: { id: true, storageKey: true },
    });

    const anonymizedPhone = buildAnonymizedPatientPhone(request.patientId);

    await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: request.patientId },
      });

      if (patient.anonymizedAt) {
        await tx.patientPrivacyErasureRequest.update({
          where: { id: request.id },
          data: {
            status: PatientPrivacyErasureStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        return;
      }

      await tx.patient.update({
        where: { id: patient.id },
        data: {
          firstName: ANONYMIZED_FIRST_NAME,
          lastName: ANONYMIZED_LAST_NAME,
          email: null,
          phone: anonymizedPhone,
          dateOfBirth: null,
          abhaId: null,
          emergencyContacts: Prisma.JsonNull,
          suggestedAction: null,
          anonymizedAt: new Date(),
        },
      });

      const histories = await tx.patientFieldHistory.findMany({
        where: {
          hospitalId: request.hospitalId,
          patientId: request.patientId,
        },
      });

      for (const history of histories) {
        if (!PII_FIELD_HISTORY_NAMES.has(history.fieldName)) {
          continue;
        }
        await tx.patientFieldHistory.update({
          where: { id: history.id },
          data: {
            oldValue: Prisma.JsonNull,
            newValue: Prisma.JsonNull,
          },
        });
      }

      await tx.patientAbhaLink.updateMany({
        where: { patientId: request.patientId },
        data: {
          abhaNumber: null,
          abhaAddress: null,
          linkToken: null,
          linkTokenExpiresAt: null,
          abdmRequestId: null,
          abdmTransactionId: null,
          providerReferenceId: null,
          linkStatus: 'UNLINKED',
        },
      });

      const now = new Date();
      for (const attachment of attachmentKeys) {
        await tx.clinicalAttachment.update({
          where: { id: attachment.id },
          data: {
            deletedAt: now,
            deletedByUserId: payload.actorUserId,
            description: null,
            originalFileName: 'erased-attachment',
          },
        });
      }

      await tx.patientPrivacyErasureRequest.update({
        where: { id: request.id },
        data: {
          status: PatientPrivacyErasureStatus.COMPLETED,
          completedAt: now,
        },
      });
    });

    if (this.blobStorage) {
      for (const attachment of attachmentKeys) {
        try {
          await this.blobStorage.delete(attachment.storageKey);
        } catch {
          // Blob deletion is best-effort; metadata is already soft-deleted.
        }
      }
    }

    await this.auditService.log({
      action: PATIENT_PRIVACY_ERASURE_COMPLETED,
      entity: 'PatientPrivacyErasureRequest',
      entityId: request.id,
      hospitalId: request.hospitalId,
      userId: payload.actorUserId,
      metadata: {
        patientId: request.patientId,
        erasureRequestId: request.id,
        attachmentsErased: attachmentKeys.length,
      },
    });

    return { completed: true, erasureRequestId: request.id };
  }

  private async findOpenRequest(
    hospitalId: string,
    patientId: string,
    status: PatientPrivacyErasureStatus,
  ) {
    const request = await this.prisma.patientPrivacyErasureRequest.findFirst({
      where: { hospitalId, patientId, status },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) {
      throw new NotFoundException('Erasure request not found');
    }
    return request;
  }

  private toErasureResponse(request: {
    id: string;
    hospitalId: string;
    patientId: string;
    status: PatientPrivacyErasureStatus;
    requestedByUserId: string | null;
    decidedByUserId: string | null;
    rejectionReason: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: request.id,
      patientId: request.patientId,
      status: request.status,
      requestedByUserId: request.requestedByUserId,
      decidedByUserId: request.decidedByUserId,
      rejectionReason: request.rejectionReason,
      completedAt: request.completedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
