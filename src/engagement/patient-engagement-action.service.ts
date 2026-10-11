import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Patient,
  PatientAtRiskStatus,
  PatientEngagementActionStatus,
  PatientEngagementActionType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import {
  ENGAGEMENT_ACTION_ACTED,
  ENGAGEMENT_ACTION_CREATED,
  ENGAGEMENT_ACTION_DISMISSED,
} from './patient-engagement-audit.actions';
import {
  AT_RISK_ACTION_SOURCE,
  NPS_DETRACTOR_ACTION_SOURCE,
} from './patient-engagement.constants';
import { buildPatientEngagementFollowUpDomainEvent } from './patient-engagement-reminder-event.util';
import { EngagementActionQueryDto } from './dto/engagement-action-query.dto';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PatientEngagementActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  async syncFromAtRiskEvaluation(input: {
    patient: Patient;
    atRiskStatus: PatientAtRiskStatus;
    suggestedAction: string;
    evaluatedAt: Date;
  }): Promise<void> {
    if (input.patient.mergedIntoPatientId || input.patient.anonymizedAt) {
      return;
    }

    if (input.atRiskStatus === PatientAtRiskStatus.INSUFFICIENT_HISTORY) {
      return;
    }

    if (input.atRiskStatus === PatientAtRiskStatus.AT_RISK) {
      await this.upsertOpenAtRiskAction(input.patient, input.suggestedAction);
      return;
    }

    await this.resolveStaleAtRiskOpenActions(input.patient.id, input.patient.hospitalId);
  }

  private async upsertOpenAtRiskAction(
    patient: Patient,
    suggestedAction: string,
  ): Promise<void> {
    const existing = await this.prisma.patientEngagementAction.findFirst({
      where: {
        hospitalId: patient.hospitalId,
        patientId: patient.id,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        metadata: {
          path: ['source'],
          equals: AT_RISK_ACTION_SOURCE,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      if (existing.suggestedAction === suggestedAction) {
        return;
      }
      await this.prisma.patientEngagementAction.update({
        where: { id: existing.id },
        data: {
          suggestedAction,
          reason: 'Cadence-gap at-risk evaluation',
        },
      });
      return;
    }

    const created = await this.prisma.patientEngagementAction.create({
      data: {
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        patientId: patient.id,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        suggestedAction,
        reason: 'Cadence-gap at-risk evaluation',
        metadata: { source: AT_RISK_ACTION_SOURCE },
      },
    });

    await this.auditService.log({
      action: ENGAGEMENT_ACTION_CREATED,
      entity: 'PatientEngagementAction',
      entityId: created.id,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
      userId: null,
      metadata: {
        patientId: patient.id,
        type: created.type,
        source: AT_RISK_ACTION_SOURCE,
      },
    });
  }

  private async resolveStaleAtRiskOpenActions(
    patientId: string,
    hospitalId: string,
  ): Promise<void> {
    await this.prisma.patientEngagementAction.updateMany({
      where: {
        hospitalId,
        patientId,
        status: PatientEngagementActionStatus.OPEN,
        metadata: {
          path: ['source'],
          equals: AT_RISK_ACTION_SOURCE,
        },
      },
      data: {
        status: PatientEngagementActionStatus.DISMISSED,
        dismissedAt: new Date(),
        reason: 'Auto-resolved: patient no longer at risk',
      },
    });
  }

  async ensureDetractorFollowUpAction(input: {
    hospitalId: string;
    branchId: string | null;
    patientId: string;
    npsResponseId: string;
    appointmentId: string;
  }): Promise<void> {
    const existing = await this.prisma.patientEngagementAction.findFirst({
      where: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        metadata: {
          path: ['npsResponseId'],
          equals: input.npsResponseId,
        },
      },
    });

    if (existing) {
      return;
    }

    const created = await this.prisma.patientEngagementAction.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        patientId: input.patientId,
        type: PatientEngagementActionType.FOLLOW_UP,
        status: PatientEngagementActionStatus.OPEN,
        suggestedAction: 'Follow up with detractor NPS response',
        reason: 'NPS detractor score',
        metadata: {
          source: NPS_DETRACTOR_ACTION_SOURCE,
          npsResponseId: input.npsResponseId,
          appointmentId: input.appointmentId,
        },
      },
    });

    await this.auditService.log({
      action: ENGAGEMENT_ACTION_CREATED,
      entity: 'PatientEngagementAction',
      entityId: created.id,
      hospitalId: input.hospitalId,
      branchId: input.branchId,
      userId: null,
      metadata: {
        patientId: input.patientId,
        source: NPS_DETRACTOR_ACTION_SOURCE,
        npsResponseId: input.npsResponseId,
      },
    });
  }

  async listActions(user: StaffUser, query: EngagementActionQueryDto) {
    const where: Prisma.PatientEngagementActionWhereInput = {
      hospitalId: user.hospitalId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
    };

    applyBranchScope(user, where);

    if (query.branchId) {
      assertBranchAccess(user, query.branchId);
      where.branchId = query.branchId;
    }

    return this.prisma.patientEngagementAction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? 50,
    });
  }

  async listActionsForPatient(user: StaffUser, patientId: string) {
    await this.findOwnedPatient(user, patientId);
    return this.prisma.patientEngagementAction.findMany({
      where: { hospitalId: user.hospitalId, patientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async actOnAction(user: StaffUser, patientId: string, actionId: string) {
    const action = await this.findOwnedAction(user, patientId, actionId);
    if (action.status !== PatientEngagementActionStatus.OPEN) {
      throw new BadRequestException('Engagement action is not open');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.patientEngagementAction.update({
        where: { id: action.id },
        data: {
          status: PatientEngagementActionStatus.ACTED,
          actedAt: now,
          actedByUserId: user.sub,
        },
      });

      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        buildPatientEngagementFollowUpDomainEvent({
          actionId: row.id,
          patientId: row.patientId,
          hospitalId: row.hospitalId,
          branchId: row.branchId,
          suggestedAction: row.suggestedAction,
        }),
      );

      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: row.hospitalId,
        branchId: row.branchId,
        outboxId: outbox.id,
      });

      return row;
    });

    await this.auditService.log({
      action: ENGAGEMENT_ACTION_ACTED,
      entity: 'PatientEngagementAction',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { patientId },
    });

    return updated;
  }

  async dismissAction(user: StaffUser, patientId: string, actionId: string) {
    const action = await this.findOwnedAction(user, patientId, actionId);
    if (action.status !== PatientEngagementActionStatus.OPEN) {
      throw new BadRequestException('Engagement action is not open');
    }

    const updated = await this.prisma.patientEngagementAction.update({
      where: { id: action.id },
      data: {
        status: PatientEngagementActionStatus.DISMISSED,
        dismissedAt: new Date(),
        dismissedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: ENGAGEMENT_ACTION_DISMISSED,
      entity: 'PatientEngagementAction',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { patientId },
    });

    return updated;
  }

  private async findOwnedPatient(user: StaffUser, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId: user.hospitalId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.branchId != null) {
      assertBranchAccess(user, patient.branchId);
    }
    return patient;
  }

  private async findOwnedAction(
    user: StaffUser,
    patientId: string,
    actionId: string,
  ) {
    await this.findOwnedPatient(user, patientId);
    const action = await this.prisma.patientEngagementAction.findFirst({
      where: {
        id: actionId,
        hospitalId: user.hospitalId,
        patientId,
      },
    });
    if (!action) {
      throw new NotFoundException('Engagement action not found');
    }
    if (action.branchId != null) {
      assertBranchAccess(user, action.branchId);
    }
    return action;
  }
}
