import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  EmergencyVisitStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { DepartmentBillingEnqueueService } from '../billing/department/department-billing-enqueue.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import {
  buildEmergencyVisitEscalatedDomainEvent,
  buildEmergencyVisitEscalatedEventPayload,
} from './emergency-visit-escalated-event.util';
import { EmergencyStaffNotificationService } from './emergency-staff-notification.service';
import { CreateEmergencyVisitDto } from './dto/create-emergency-visit.dto';
import { CreateTriageDto } from './dto/create-triage.dto';
import { EmergencyVisitQueryDto } from './dto/emergency-visit-query.dto';
import { EscalateDto } from './dto/escalate.dto';
import { SetDispositionDto } from './dto/set-disposition.dto';
import {
  canSetDisposition,
  canStartTreatment,
  isAllowedEmergencyVisitTransition,
  isEmergencyVisitCancellable,
  isEmergencyVisitTerminal,
} from './utils/emergency-visit-transitions.util';
import { validateVitalSigns } from './utils/vital-signs.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const visitInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  branch: {
    select: { id: true, name: true, code: true },
  },
  encounter: {
    select: {
      id: true,
      encounterType: true,
      status: true,
      providerUserId: true,
    },
  },
  triageRecords: {
    orderBy: { assessedAt: 'desc' as const },
    include: {
      assessedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} satisfies Prisma.EmergencyVisitInclude;

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly emergencyStaffNotificationService: EmergencyStaffNotificationService,
    private readonly departmentBillingEnqueue?: DepartmentBillingEnqueueService,
  ) {}

  private async validatePatient(user: AuthenticatedUser, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.mergedIntoPatientId) {
      throw new BadRequestException('Patient record is not active');
    }

    if (patient.branchId != null) {
      assertBranchAccess(user, patient.branchId);
    }

    return patient;
  }

  private async validateBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }

    return branch;
  }

  private async validateAssessor(user: AuthenticatedUser, userId: string) {
    const assessor = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!assessor || assessor.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Assessor not found');
    }

    return assessor;
  }

  private async findOwnedVisit(user: AuthenticatedUser, visitId: string) {
    const visit = await this.prisma.emergencyVisit.findUnique({
      where: { id: visitId },
      include: visitInclude,
    });

    if (!visit || visit.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Emergency visit not found');
    }

    assertBranchAccess(user, visit.branchId);

    return visit;
  }

  private assertTransition(
    currentStatus: EmergencyVisitStatus,
    nextStatus: EmergencyVisitStatus,
  ): void {
    if (!isAllowedEmergencyVisitTransition(currentStatus, nextStatus)) {
      throw new BadRequestException(
        `Cannot transition emergency visit from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private assertVisitModifiable(status: EmergencyVisitStatus): void {
    if (isEmergencyVisitTerminal(status)) {
      throw new BadRequestException('Emergency visit is no longer modifiable');
    }
  }

  private formatVisit(
    visit: Prisma.EmergencyVisitGetPayload<{ include: typeof visitInclude }>,
  ) {
    const latestTriage = visit.triageRecords[0] ?? null;

    return {
      id: visit.id,
      hospitalId: visit.hospitalId,
      branchId: visit.branchId,
      patientId: visit.patientId,
      encounterId: visit.encounterId,
      arrivalAt: visit.arrivalAt,
      status: visit.status,
      priority: visit.priority,
      chiefComplaint: visit.chiefComplaint,
      notes: visit.notes,
      disposition: visit.disposition,
      treatmentStartedAt: visit.treatmentStartedAt,
      dispositionAt: visit.dispositionAt,
      createdAt: visit.createdAt,
      updatedAt: visit.updatedAt,
      patient: visit.patient,
      branch: visit.branch,
      encounter: visit.encounter,
      latestTriage: latestTriage
        ? {
            id: latestTriage.id,
            priority: latestTriage.priority,
            assessedAt: latestTriage.assessedAt,
            assessedBy: latestTriage.assessedBy,
            temperature: latestTriage.temperature,
            heartRate: latestTriage.heartRate,
            respiratoryRate: latestTriage.respiratoryRate,
            systolicBp: latestTriage.systolicBp,
            diastolicBp: latestTriage.diastolicBp,
            oxygenSaturation: latestTriage.oxygenSaturation,
            painScore: latestTriage.painScore,
            consciousness: latestTriage.consciousness,
            escalatedAt: latestTriage.escalatedAt,
            escalationReason: latestTriage.escalationReason,
          }
        : null,
    };
  }

  private formatTriageRecord(
    record: Prisma.TriageRecordGetPayload<{
      include: { assessedBy: { select: { id: true; name: true; email: true } } };
    }>,
  ) {
    return {
      id: record.id,
      emergencyVisitId: record.emergencyVisitId,
      priority: record.priority,
      assessedAt: record.assessedAt,
      assessedBy: record.assessedBy,
      temperature: record.temperature,
      heartRate: record.heartRate,
      respiratoryRate: record.respiratoryRate,
      systolicBp: record.systolicBp,
      diastolicBp: record.diastolicBp,
      oxygenSaturation: record.oxygenSaturation,
      painScore: record.painScore,
      consciousness: record.consciousness,
      notes: record.notes,
      escalatedAt: record.escalatedAt,
      escalationReason: record.escalationReason,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Future notification hook — no external alerts are sent today.
   */
  private async onEmergencyEscalated(
    visitId: string,
    triageRecordId: string,
    reason: string,
  ): Promise<void> {
    void visitId;
    void triageRecordId;
    void reason;
  }

  async createVisit(user: AuthenticatedUser, dto: CreateEmergencyVisitDto) {
    await this.validatePatient(user, dto.patientId);
    await this.validateAssessor(user, user.sub);

    const branchId = resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    const visit = await this.prisma.$transaction(async (tx) => {
      const encounter = await tx.clinicalEncounter.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          patientId: dto.patientId,
          providerUserId: user.sub,
          encounterType: ClinicalEncounterType.EMERGENCY,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      return tx.emergencyVisit.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          patientId: dto.patientId,
          encounterId: encounter.id,
          priority: dto.priority,
          chiefComplaint: dto.chiefComplaint.trim(),
          notes: dto.notes?.trim(),
          status: EmergencyVisitStatus.ARRIVED,
        },
        include: visitInclude,
      });
    });

    await this.auditService.log({
      action: 'EMERGENCY_VISIT_CREATED',
      entity: 'EmergencyVisit',
      entityId: visit.id,
      hospitalId: user.hospitalId,
      branchId: visit.branchId,
      userId: user.sub,
      metadata: {
        patientId: visit.patientId,
        encounterId: visit.encounterId,
        priority: visit.priority,
        status: visit.status,
      },
    });

    return this.formatVisit(visit);
  }

  async listVisits(user: AuthenticatedUser, query: EmergencyVisitQueryDto) {
    const where: Prisma.EmergencyVisitWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(`${query.date}T23:59:59.999Z`);
      where.arrivalAt = { gte: start, lte: end };
    }

    const visits = await this.prisma.emergencyVisit.findMany({
      where: applyBranchScope(user, where),
      include: visitInclude,
      orderBy: { arrivalAt: 'desc' },
    });

    return visits.map((visit) => this.formatVisit(visit));
  }

  async getVisit(user: AuthenticatedUser, visitId: string) {
    const visit = await this.findOwnedVisit(user, visitId);
    return this.formatVisit(visit);
  }

  async createTriage(
    user: AuthenticatedUser,
    visitId: string,
    dto: CreateTriageDto,
  ) {
    const visit = await this.findOwnedVisit(user, visitId);
    this.assertVisitModifiable(visit.status);

    if (
      visit.status !== EmergencyVisitStatus.ARRIVED &&
      visit.status !== EmergencyVisitStatus.TRIAGED
    ) {
      throw new BadRequestException(
        'Triage can only be recorded before treatment starts',
      );
    }

    validateVitalSigns({
      temperature: dto.temperature,
      heartRate: dto.heartRate,
      respiratoryRate: dto.respiratoryRate,
      systolicBp: dto.systolicBp,
      diastolicBp: dto.diastolicBp,
      oxygenSaturation: dto.oxygenSaturation,
      painScore: dto.painScore,
    });

    await this.validateAssessor(user, user.sub);

    const isFirstTriage = visit.triageRecords.length === 0;
    const previousStatus = visit.status;

    const result = await this.prisma.$transaction(async (tx) => {
      const triageRecord = await tx.triageRecord.create({
        data: {
          hospitalId: user.hospitalId,
          emergencyVisitId: visit.id,
          assessedByUserId: user.sub,
          priority: dto.priority,
          temperature: dto.temperature,
          heartRate: dto.heartRate,
          respiratoryRate: dto.respiratoryRate,
          systolicBp: dto.systolicBp,
          diastolicBp: dto.diastolicBp,
          oxygenSaturation: dto.oxygenSaturation,
          painScore: dto.painScore,
          consciousness: dto.consciousness?.trim(),
          notes: dto.notes?.trim(),
        },
        include: {
          assessedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const visitUpdate: Prisma.EmergencyVisitUpdateInput = {
        priority: dto.priority,
      };

      if (visit.status === EmergencyVisitStatus.ARRIVED) {
        this.assertTransition(
          visit.status,
          EmergencyVisitStatus.TRIAGED,
        );
        visitUpdate.status = EmergencyVisitStatus.TRIAGED;
      }

      const updatedVisit = await tx.emergencyVisit.update({
        where: { id: visit.id },
        data: visitUpdate,
        include: visitInclude,
      });

      return { triageRecord, updatedVisit };
    });

    await this.auditService.log({
      action: isFirstTriage
        ? 'EMERGENCY_TRIAGE_CREATED'
        : 'EMERGENCY_TRIAGE_UPDATED',
      entity: 'TriageRecord',
      entityId: result.triageRecord.id,
      hospitalId: user.hospitalId,
      branchId: visit.branchId,
      userId: user.sub,
      metadata: {
        emergencyVisitId: visit.id,
        priority: dto.priority,
        previousVisitStatus: previousStatus,
        newVisitStatus: result.updatedVisit.status,
      },
    });

    return {
      triage: this.formatTriageRecord(result.triageRecord),
      visit: this.formatVisit(result.updatedVisit),
    };
  }

  async getTriageHistory(user: AuthenticatedUser, visitId: string) {
    const visit = await this.findOwnedVisit(user, visitId);

    return {
      emergencyVisitId: visit.id,
      records: visit.triageRecords.map((record) => this.formatTriageRecord(record)),
    };
  }

  async escalate(user: AuthenticatedUser, visitId: string, dto: EscalateDto) {
    const visit = await this.findOwnedVisit(user, visitId);
    this.assertVisitModifiable(visit.status);

    const latestTriage = visit.triageRecords[0];

    if (!latestTriage) {
      throw new BadRequestException(
        'Triage must be recorded before escalation',
      );
    }

    if (latestTriage.escalatedAt) {
      throw new BadRequestException('Emergency visit is already escalated');
    }

    const updatedTriage = await this.prisma.$transaction(async (tx) => {
      const triage = await tx.triageRecord.update({
        where: { id: latestTriage.id },
        data: {
          escalatedAt: new Date(),
          escalationReason: dto.reason.trim(),
        },
        include: {
          assessedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const event = buildEmergencyVisitEscalatedDomainEvent({
        emergencyVisitId: visit.id,
        triageRecordId: triage.id,
        patientId: visit.patientId,
        hospitalId: user.hospitalId,
        branchId: visit.branchId,
        visitPriority: visit.priority,
        triagePriority: triage.priority,
        escalationReason: dto.reason.trim(),
        escalatedByUserId: user.sub,
      });

      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        event,
      );

      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: user.hospitalId,
        branchId: visit.branchId,
        outboxId: outbox.id,
      });

      return triage;
    });

    await this.auditService.log({
      action: 'EMERGENCY_ESCALATED',
      entity: 'TriageRecord',
      entityId: updatedTriage.id,
      hospitalId: user.hospitalId,
      branchId: visit.branchId,
      userId: user.sub,
      metadata: {
        emergencyVisitId: visit.id,
        priority: visit.priority,
      },
    });

    await this.onEmergencyEscalated(visit.id, updatedTriage.id, dto.reason);

    const escalationSnapshot = buildEmergencyVisitEscalatedEventPayload({
      emergencyVisitId: visit.id,
      triageRecordId: updatedTriage.id,
      patientId: visit.patientId,
      hospitalId: user.hospitalId,
      branchId: visit.branchId,
      visitPriority: visit.priority,
      triagePriority: updatedTriage.priority,
      escalationReason: dto.reason.trim(),
      escalatedByUserId: user.sub,
    });
    await this.emergencyStaffNotificationService.notifyEscalation({
      hospitalId: user.hospitalId,
      branchId: visit.branchId,
      emergencyVisitId: visit.id,
      triageRecordId: updatedTriage.id,
      summary: escalationSnapshot.summary,
      excludeUserId: user.sub,
    });

    return {
      triage: this.formatTriageRecord(updatedTriage),
    };
  }

  async startTreatment(user: AuthenticatedUser, visitId: string) {
    const visit = await this.findOwnedVisit(user, visitId);

    if (!canStartTreatment(visit.status)) {
      throw new BadRequestException(
        `Treatment cannot start when visit status is ${visit.status}`,
      );
    }

    if (visit.triageRecords.length === 0) {
      throw new BadRequestException('Triage must be completed before treatment');
    }

    this.assertTransition(visit.status, EmergencyVisitStatus.IN_TREATMENT);

    const updated = await this.prisma.emergencyVisit.update({
      where: { id: visit.id },
      data: {
        status: EmergencyVisitStatus.IN_TREATMENT,
        treatmentStartedAt: new Date(),
      },
      include: visitInclude,
    });

    await this.auditService.log({
      action: 'EMERGENCY_TREATMENT_STARTED',
      entity: 'EmergencyVisit',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        patientId: updated.patientId,
        previousStatus: visit.status,
        newStatus: updated.status,
      },
    });

    return this.formatVisit(updated);
  }

  async setDisposition(
    user: AuthenticatedUser,
    visitId: string,
    dto: SetDispositionDto,
  ) {
    const visit = await this.findOwnedVisit(user, visitId);

    if (!canSetDisposition(visit.status)) {
      throw new BadRequestException(
        `Disposition cannot be set when visit status is ${visit.status}`,
      );
    }

    const nextStatus = dto.disposition as unknown as EmergencyVisitStatus;
    this.assertTransition(visit.status, nextStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      const visitUpdated = await tx.emergencyVisit.update({
        where: { id: visit.id },
        data: {
          status: nextStatus,
          disposition: dto.disposition,
          dispositionAt: new Date(),
        },
        include: visitInclude,
      });

      await tx.clinicalEncounter.update({
        where: { id: visit.encounterId },
        data: {
          status: ClinicalEncounterStatus.COMPLETED,
          endedAt: new Date(),
        },
      });

      return visitUpdated;
    });

    await this.auditService.log({
      action: 'EMERGENCY_DISPOSITION_SET',
      entity: 'EmergencyVisit',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        disposition: dto.disposition,
        previousStatus: visit.status,
        newStatus: updated.status,
      },
    });

    return this.formatVisit(updated);
  }

  async cancelVisit(user: AuthenticatedUser, visitId: string) {
    const visit = await this.findOwnedVisit(user, visitId);

    if (!isEmergencyVisitCancellable(visit.status)) {
      throw new BadRequestException(
        `Visit cannot be cancelled when status is ${visit.status}`,
      );
    }

    this.assertTransition(visit.status, EmergencyVisitStatus.CANCELLED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const visitUpdated = await tx.emergencyVisit.update({
        where: { id: visit.id },
        data: { status: EmergencyVisitStatus.CANCELLED },
        include: visitInclude,
      });

      await tx.clinicalEncounter.update({
        where: { id: visit.encounterId },
        data: {
          status: ClinicalEncounterStatus.CANCELLED,
          endedAt: new Date(),
        },
      });

      return visitUpdated;
    });

    await this.auditService.log({
      action: 'EMERGENCY_CANCELLED',
      entity: 'EmergencyVisit',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        previousStatus: visit.status,
        newStatus: updated.status,
      },
    });

    return this.formatVisit(updated);
  }
}
