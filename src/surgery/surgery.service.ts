import {

  BadRequestException,

  ConflictException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import {

  AppointmentStatus,

  ClinicalEncounterStatus,

  IpdAdmissionStatus,

  Prisma,

  ResourceType,

  SurgeryRequestStatus,

  SurgeryScheduleStatus,

} from '@prisma/client';

import { AuditService } from '../audit/audit.service';

import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
} from '../common/auth/branch-scope.util';

import { PrismaService } from '../common/prisma/prisma.service';

import { DepartmentBillingEnqueueService } from '../billing/department/department-billing-enqueue.service';
import { AppointmentsService } from '../scheduling/appointments/appointments.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { buildSurgeryScheduledStaffDomainEvent } from './surgery-scheduled-staff-event.util';
import { assertSurgeryInsuranceGate } from './utils/surgery-insurance-gate.util';

import { CreatePostOpRecordDto, UpdatePostOpRecordDto } from './dto/post-op.dto';

import { CreatePreOpAssessmentDto } from './dto/pre-op.dto';

import {

  CreateProcedureRecordDto,

  UpdateProcedureRecordDto,

} from './dto/procedure.dto';

import {

  CancelSurgeryRequestDto,

  CreateSurgeryRequestDto,

  SurgeryRequestQueryDto,

} from './dto/request.dto';

import { ScheduleSurgeryDto, SurgeryScheduleQueryDto } from './dto/schedule.dto';

import {

  isAllowedSurgeryRequestTransition,

  isSurgeryRequestCancellable,

} from './utils/surgery-request-transitions.util';



type AuthenticatedUser = {

  sub: string;

  hospitalId: string;

  branchId?: string | null;

};



const surgeryRequestInclude = {

  patient: { select: { id: true, firstName: true, lastName: true } },

  encounter: { select: { id: true, encounterType: true, status: true } },

  admission: { select: { id: true, admissionNumber: true, status: true } },

  preAuthorization: { select: { id: true, status: true, authorizationNumber: true } },

  preOpAssessment: true,

  schedule: {

    include: {

      resource: { select: { id: true, name: true, type: true } },

      appointment: { select: { id: true, startAt: true, endAt: true, status: true } },

    },

  },

  procedureRecord: true,

  postOpRecord: true,

} as const;



@Injectable()

export class SurgeryService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly appointmentsService: AppointmentsService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly departmentBillingEnqueue?: DepartmentBillingEnqueueService,
  ) {}



  private async validatePatient(user: AuthenticatedUser, patientId: string) {

    const patient = await this.prisma.patient.findFirst({

      where: { id: patientId, hospitalId: user.hospitalId, mergedIntoPatientId: null },

    });

    if (!patient) throw new NotFoundException('Patient not found');

    if (patient.branchId != null) {

      assertBranchAccess(user, patient.branchId);

    }

    return patient;

  }



  private async validateBranch(user: AuthenticatedUser, branchId: string) {

    const branch = await this.prisma.branch.findFirst({

      where: { id: branchId, hospitalId: user.hospitalId },

    });

    if (!branch) throw new NotFoundException('Branch not found');

    return branch;

  }



  private async validateUser(user: AuthenticatedUser, userId: string) {

    const found = await this.prisma.user.findFirst({

      where: { id: userId, hospitalId: user.hospitalId },

    });

    if (!found) throw new NotFoundException('User not found');

    return found;

  }



  private async validateEncounter(

    user: AuthenticatedUser,

    encounterId: string,

    patientId: string,

  ) {

    const encounter = await this.prisma.clinicalEncounter.findFirst({

      where: { id: encounterId, hospitalId: user.hospitalId },

    });

    if (!encounter) throw new NotFoundException('Clinical encounter not found');

    if (encounter.patientId !== patientId) {

      throw new BadRequestException('Encounter patient does not match surgery patient');

    }

    if (encounter.status === ClinicalEncounterStatus.CANCELLED) {

      throw new BadRequestException('Cannot link surgery to a cancelled encounter');

    }

    assertBranchAccess(user, encounter.branchId);

    return encounter;

  }



  private async validateAdmission(

    user: AuthenticatedUser,

    admissionId: string,

    patientId: string,

    requireActive = false,

  ) {

    const admission = await this.prisma.ipdAdmission.findFirst({

      where: { id: admissionId, hospitalId: user.hospitalId },

    });

    if (!admission) throw new NotFoundException('IPD admission not found');

    if (admission.patientId !== patientId) {

      throw new BadRequestException('Admission patient does not match surgery patient');

    }

    if (requireActive && admission.status !== IpdAdmissionStatus.ADMITTED) {

      throw new BadRequestException('Admission must be active');

    }

    assertBranchAccess(user, admission.branchId);

    return admission;

  }



  private async validatePreAuthorization(

    user: AuthenticatedUser,

    preAuthorizationId: string,

    patientId: string,

  ) {

    const preAuth = await this.prisma.insurancePreAuthorization.findFirst({

      where: { id: preAuthorizationId, hospitalId: user.hospitalId },

    });

    if (!preAuth) throw new NotFoundException('Insurance pre-authorization not found');

    if (preAuth.patientId !== patientId) {

      throw new BadRequestException('Pre-authorization patient does not match surgery patient');

    }

    assertBranchAccess(user, preAuth.branchId);

    return preAuth;

  }



  private async validateOtResource(user: AuthenticatedUser, resourceId: string, branchId?: string | null) {

    const resource = await this.prisma.resource.findFirst({

      where: { id: resourceId, hospitalId: user.hospitalId },

    });

    if (!resource) throw new NotFoundException('Operation theatre resource not found');

    if (resource.type !== ResourceType.OPERATION_THEATRE) {

      throw new BadRequestException('Resource must be an operation theatre');

    }

    if (branchId && resource.branchId && resource.branchId !== branchId) {

      throw new BadRequestException('Operation theatre does not belong to the specified branch');

    }

    return resource;

  }



  private async findOwnedRequest(user: AuthenticatedUser, id: string) {

    const request = await this.prisma.surgeryRequest.findFirst({

      where: { id, hospitalId: user.hospitalId },

      include: surgeryRequestInclude,

    });

    if (!request) throw new NotFoundException('Surgery request not found');

    assertBranchAccess(user, request.branchId);

    return request;

  }



  private assertTransition(current: SurgeryRequestStatus, next: SurgeryRequestStatus) {

    if (!isAllowedSurgeryRequestTransition(current, next)) {

      throw new BadRequestException(`Cannot transition surgery request from ${current} to ${next}`);

    }

  }



  async createRequest(user: AuthenticatedUser, dto: CreateSurgeryRequestDto) {

    await this.validatePatient(user, dto.patientId);

    await this.validateEncounter(user, dto.encounterId, dto.patientId);



    const branchId = resolveCreateBranchId(user, dto.branchId);

    if (user.branchId == null && branchId) {

      await this.validateBranch(user, branchId);

    }

    if (dto.admissionId) {

      await this.validateAdmission(user, dto.admissionId, dto.patientId, true);

    }

    if (dto.preAuthorizationId) {

      await this.validatePreAuthorization(user, dto.preAuthorizationId, dto.patientId);

    }



    const request = await this.prisma.surgeryRequest.create({

      data: {

        hospitalId: user.hospitalId,

        branchId,

        patientId: dto.patientId,

        encounterId: dto.encounterId,

        admissionId: dto.admissionId,

        preAuthorizationId: dto.preAuthorizationId,

        requestedByUserId: user.sub,

        procedureName: dto.procedureName.trim(),

        procedureCode: dto.procedureCode?.trim(),

        indication: dto.indication?.trim(),

        priority: dto.priority,

        notes: dto.notes?.trim(),

      },

      include: surgeryRequestInclude,

    });



    await this.auditService.log({

      action: 'SURGERY_REQUEST_CREATED',

      entity: 'SurgeryRequest',

      entityId: request.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: {

        patientId: request.patientId,

        encounterId: request.encounterId,

        priority: request.priority,

        status: request.status,

      },

    });



    return request;

  }



  async listRequests(user: AuthenticatedUser, query: SurgeryRequestQueryDto) {

    const where: Prisma.SurgeryRequestWhereInput = { hospitalId: user.hospitalId };

    if (query.patientId) {

      await this.validatePatient(user, query.patientId);

      where.patientId = query.patientId;

    }

    if (query.encounterId) where.encounterId = query.encounterId;

    if (query.status) where.status = query.status as SurgeryRequestStatus;

    if (query.priority) where.priority = query.priority as any;



    return this.prisma.surgeryRequest.findMany({

      where: applyBranchScope(user, where),

      include: surgeryRequestInclude,

      orderBy: { requestedAt: 'desc' },

    });

  }



  async getRequest(user: AuthenticatedUser, id: string) {

    return this.findOwnedRequest(user, id);

  }



  async recordPreOp(user: AuthenticatedUser, id: string, dto: CreatePreOpAssessmentDto) {

    const request = await this.findOwnedRequest(user, id);



    if (request.preOpAssessment) {

      throw new ConflictException('Pre-operative assessment already recorded');

    }



    this.assertTransition(request.status, SurgeryRequestStatus.PRE_OP);



    const assessment = await this.prisma.$transaction(async (tx) => {

      const created = await tx.surgeryPreOpAssessment.create({

        data: {

          hospitalId: user.hospitalId,

          surgeryRequestId: id,

          assessedByUserId: user.sub,

          fitnessStatus: dto.fitnessStatus,

          notes: dto.notes?.trim(),

        },

      });



      await tx.surgeryRequest.update({

        where: { id },

        data: { status: SurgeryRequestStatus.PRE_OP },

      });



      return created;

    });



    await this.auditService.log({

      action: 'SURGERY_PREOP_RECORDED',

      entity: 'SurgeryPreOpAssessment',

      entityId: assessment.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: {

        surgeryRequestId: id,

        fitnessStatus: dto.fitnessStatus,

      },

    });



    return this.findOwnedRequest(user, id);

  }



  async getPreOp(user: AuthenticatedUser, id: string) {

    const request = await this.findOwnedRequest(user, id);

    if (!request.preOpAssessment) {

      throw new NotFoundException('Pre-operative assessment not found');

    }

    return request.preOpAssessment;

  }



  async scheduleRequest(user: AuthenticatedUser, id: string, dto: ScheduleSurgeryDto) {

    const request = await this.findOwnedRequest(user, id);



    if (request.schedule) {

      throw new ConflictException('Surgery is already scheduled');

    }



    if (request.preOpAssessment?.fitnessStatus === 'NOT_FIT') {

      throw new BadRequestException('Cannot schedule surgery when patient is not fit');

    }

    await assertSurgeryInsuranceGate(this.prisma, user, {
      patientId: request.patientId,
      preAuthorizationId: request.preAuthorizationId,
    });

    this.assertTransition(request.status, SurgeryRequestStatus.SCHEDULED);



    const branchId = dto.branchId ?? request.branchId;

    if (branchId) await this.validateBranch(user, branchId);

    await this.validateOtResource(user, dto.resourceId, branchId);



    const startAt = new Date(dto.startAt);

    const endAt = new Date(dto.endAt);

    if (endAt <= startAt) {

      throw new BadRequestException('endAt must be after startAt');

    }



    const appointment = await this.appointmentsService.create(user, {

      patientId: request.patientId,

      branchId: branchId ?? undefined,

      startAt: dto.startAt,

      endAt: dto.endAt,

      resourceIds: [dto.resourceId],

      reason: `Surgery: ${request.procedureName}`,

    });



    const schedule = await this.prisma.$transaction(async (tx) => {

      const created = await tx.surgerySchedule.create({

        data: {

          hospitalId: user.hospitalId,

          branchId: branchId ?? undefined,

          surgeryRequestId: id,

          resourceId: dto.resourceId,

          appointmentId: appointment.id,

          scheduledByUserId: user.sub,

          status: SurgeryScheduleStatus.SCHEDULED,

        },

      });



      await tx.surgeryRequest.update({

        where: { id },

        data: {

          status: SurgeryRequestStatus.SCHEDULED,

          scheduledAt: startAt,

        },

      });

      const event = buildSurgeryScheduledStaffDomainEvent({
        surgeryRequestId: id,
        scheduleId: created.id,
        procedureName: request.procedureName,
        hospitalId: user.hospitalId,
        branchId: branchId ?? null,
        startAt: startAt.toISOString(),
      });
      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        event,
      );
      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: user.hospitalId,
        branchId: branchId ?? null,
        outboxId: outbox.id,
      });

      return created;

    });



    await this.auditService.log({

      action: 'SURGERY_SCHEDULED',

      entity: 'SurgerySchedule',

      entityId: schedule.id,

      hospitalId: user.hospitalId,

      branchId: schedule.branchId,

      userId: user.sub,

      metadata: {

        surgeryRequestId: id,

        resourceId: dto.resourceId,

        appointmentId: appointment.id,

        startAt: startAt.toISOString(),

        endAt: endAt.toISOString(),

      },

    });



    return this.findOwnedRequest(user, id);

  }



  async startRequest(user: AuthenticatedUser, id: string) {

    const request = await this.findOwnedRequest(user, id);

    this.assertTransition(request.status, SurgeryRequestStatus.IN_PROGRESS);



    if (!request.schedule) {

      throw new BadRequestException('Surgery must be scheduled before starting');

    }

    await assertSurgeryInsuranceGate(this.prisma, user, {
      patientId: request.patientId,
      preAuthorizationId: request.preAuthorizationId,
    });

    await this.prisma.$transaction(async (tx) => {

      await tx.surgeryRequest.update({

        where: { id },

        data: { status: SurgeryRequestStatus.IN_PROGRESS },

      });

      await tx.surgerySchedule.update({

        where: { id: request.schedule!.id },

        data: { status: SurgeryScheduleStatus.IN_PROGRESS },

      });

    });



    await this.auditService.log({

      action: 'SURGERY_STARTED',

      entity: 'SurgeryRequest',

      entityId: id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { previousStatus: request.status },

    });



    return this.findOwnedRequest(user, id);

  }



  async createProcedureRecord(

    user: AuthenticatedUser,

    id: string,

    dto: CreateProcedureRecordDto,

  ) {

    const request = await this.findOwnedRequest(user, id);

    if (request.procedureRecord) {

      throw new ConflictException('Procedure record already exists');

    }



    await this.validateUser(user, dto.surgeonUserId);

    if (dto.assistantUserId) {

      await this.validateUser(user, dto.assistantUserId);

    }



    const record = await this.prisma.surgeryProcedureRecord.create({

      data: {

        hospitalId: user.hospitalId,

        surgeryRequestId: id,

        surgeonUserId: dto.surgeonUserId,

        assistantUserId: dto.assistantUserId,

        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,

        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,

        procedureNotes: dto.procedureNotes?.trim(),

        findings: dto.findings?.trim(),

        complications: dto.complications?.trim(),

        outcome: dto.outcome?.trim(),

      },

    });



    await this.auditService.log({

      action: 'SURGERY_PROCEDURE_RECORDED',

      entity: 'SurgeryProcedureRecord',

      entityId: record.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { surgeryRequestId: id, surgeonUserId: dto.surgeonUserId },

    });



    return record;

  }



  async getProcedureRecord(user: AuthenticatedUser, id: string) {

    const request = await this.findOwnedRequest(user, id);

    if (!request.procedureRecord) {

      throw new NotFoundException('Procedure record not found');

    }

    return request.procedureRecord;

  }



  async updateProcedureRecord(

    user: AuthenticatedUser,

    id: string,

    dto: UpdateProcedureRecordDto,

  ) {

    const request = await this.findOwnedRequest(user, id);

    if (!request.procedureRecord) {

      throw new NotFoundException('Procedure record not found');

    }



    if (dto.assistantUserId) {

      await this.validateUser(user, dto.assistantUserId);

    }



    const record = await this.prisma.surgeryProcedureRecord.update({

      where: { id: request.procedureRecord.id },

      data: {

        ...(dto.assistantUserId !== undefined && { assistantUserId: dto.assistantUserId }),

        ...(dto.startedAt !== undefined && { startedAt: new Date(dto.startedAt) }),

        ...(dto.completedAt !== undefined && { completedAt: new Date(dto.completedAt) }),

        ...(dto.procedureNotes !== undefined && { procedureNotes: dto.procedureNotes.trim() }),

        ...(dto.findings !== undefined && { findings: dto.findings.trim() }),

        ...(dto.complications !== undefined && { complications: dto.complications.trim() }),

        ...(dto.outcome !== undefined && { outcome: dto.outcome.trim() }),

      },

    });



    await this.auditService.log({

      action: 'SURGERY_PROCEDURE_RECORDED',

      entity: 'SurgeryProcedureRecord',

      entityId: record.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { surgeryRequestId: id, updated: true },

    });



    return record;

  }



  async completeRequest(user: AuthenticatedUser, id: string) {

    const request = await this.findOwnedRequest(user, id);

    this.assertTransition(request.status, SurgeryRequestStatus.COMPLETED);



    const completedAt = new Date();



    await this.prisma.$transaction(async (tx) => {

      await tx.surgeryRequest.update({

        where: { id },

        data: { status: SurgeryRequestStatus.COMPLETED, completedAt },

      });



      if (request.schedule) {

        await tx.surgerySchedule.update({

          where: { id: request.schedule.id },

          data: { status: SurgeryScheduleStatus.COMPLETED },

        });

        await tx.appointment.update({

          where: { id: request.schedule.appointmentId },

          data: { status: AppointmentStatus.COMPLETED },

        });

      }

    });



    await this.auditService.log({

      action: 'SURGERY_COMPLETED',

      entity: 'SurgeryRequest',

      entityId: id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { completedAt: completedAt.toISOString() },

    });



    return this.findOwnedRequest(user, id);

  }



  async createPostOpRecord(user: AuthenticatedUser, id: string, dto: CreatePostOpRecordDto) {

    const request = await this.findOwnedRequest(user, id);

    if (request.postOpRecord) {

      throw new ConflictException('Post-operative record already exists');

    }



    const record = await this.prisma.surgeryPostOpRecord.create({

      data: {

        hospitalId: user.hospitalId,

        surgeryRequestId: id,

        recordedByUserId: user.sub,

        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),

        notes: dto.notes?.trim(),

        followUpInstructions: dto.followUpInstructions?.trim(),

      },

    });



    await this.auditService.log({

      action: 'SURGERY_POSTOP_RECORDED',

      entity: 'SurgeryPostOpRecord',

      entityId: record.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { surgeryRequestId: id },

    });



    return record;

  }



  async getPostOpRecord(user: AuthenticatedUser, id: string) {

    const request = await this.findOwnedRequest(user, id);

    if (!request.postOpRecord) {

      throw new NotFoundException('Post-operative record not found');

    }

    return request.postOpRecord;

  }



  async updatePostOpRecord(user: AuthenticatedUser, id: string, dto: UpdatePostOpRecordDto) {

    const request = await this.findOwnedRequest(user, id);

    if (!request.postOpRecord) {

      throw new NotFoundException('Post-operative record not found');

    }



    const record = await this.prisma.surgeryPostOpRecord.update({

      where: { id: request.postOpRecord.id },

      data: {

        ...(dto.notes !== undefined && { notes: dto.notes.trim() }),

        ...(dto.followUpInstructions !== undefined && {

          followUpInstructions: dto.followUpInstructions.trim(),

        }),

        ...(dto.recordedAt !== undefined && { recordedAt: new Date(dto.recordedAt) }),

      },

    });



    await this.auditService.log({

      action: 'SURGERY_POSTOP_RECORDED',

      entity: 'SurgeryPostOpRecord',

      entityId: record.id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { surgeryRequestId: id, updated: true },

    });



    return record;

  }



  async cancelRequest(user: AuthenticatedUser, id: string, dto: CancelSurgeryRequestDto) {

    const request = await this.findOwnedRequest(user, id);



    if (!isSurgeryRequestCancellable(request.status)) {

      throw new BadRequestException(`Surgery request cannot be cancelled when ${request.status}`);

    }



    this.assertTransition(request.status, SurgeryRequestStatus.CANCELLED);

    const cancelledAt = new Date();



    await this.prisma.$transaction(async (tx) => {

      await tx.surgeryRequest.update({

        where: { id },

        data: {

          status: SurgeryRequestStatus.CANCELLED,

          cancelledAt,

          cancellationReason: dto.cancellationReason.trim(),

        },

      });



      if (request.schedule) {

        await tx.surgerySchedule.update({

          where: { id: request.schedule.id },

          data: { status: SurgeryScheduleStatus.CANCELLED },

        });

        await tx.appointment.update({

          where: { id: request.schedule.appointmentId },

          data: { status: AppointmentStatus.CANCELLED },

        });

      }

    });



    await this.auditService.log({

      action: 'SURGERY_CANCELLED',

      entity: 'SurgeryRequest',

      entityId: id,

      hospitalId: user.hospitalId,

      branchId: request.branchId,

      userId: user.sub,

      metadata: { previousStatus: request.status, cancelledAt: cancelledAt.toISOString() },

    });



    return this.findOwnedRequest(user, id);

  }



  async listSchedules(user: AuthenticatedUser, query: SurgeryScheduleQueryDto) {

    const where: Prisma.SurgeryScheduleWhereInput = { hospitalId: user.hospitalId };



    if (query.resourceId) {

      await this.validateOtResource(user, query.resourceId);

      where.resourceId = query.resourceId;

    }

    if (query.status) where.status = query.status as SurgeryScheduleStatus;

    if (query.patientId) {

      await this.validatePatient(user, query.patientId);

      where.surgeryRequest = { patientId: query.patientId };

    }



    return this.prisma.surgerySchedule.findMany({

      where: applyBranchScope(user, where),

      include: {

        surgeryRequest: {

          select: {

            id: true,

            procedureName: true,

            status: true,

            patientId: true,

            patient: { select: { id: true, firstName: true, lastName: true } },

          },

        },

        resource: { select: { id: true, name: true, type: true } },

        appointment: { select: { id: true, startAt: true, endAt: true, status: true } },

        scheduledBy: { select: { id: true, name: true } },

      },

      orderBy: { createdAt: 'desc' },

    });

  }



  async getSchedule(user: AuthenticatedUser, id: string) {

    const schedule = await this.prisma.surgerySchedule.findFirst({

      where: { id, hospitalId: user.hospitalId },

      include: {

        surgeryRequest: {

          include: {

            patient: { select: { id: true, firstName: true, lastName: true } },

          },

        },

        resource: true,

        appointment: true,

        scheduledBy: { select: { id: true, name: true } },

      },

    });

    if (!schedule) throw new NotFoundException('Surgery schedule not found');

    assertBranchAccess(user, schedule.branchId);

    return schedule;

  }

}


