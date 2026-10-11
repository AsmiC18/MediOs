import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  Resource,
  ResourceStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
  resolveUpdateBranchId,
} from '../../common/auth/branch-scope.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { buildAppointmentBookedDomainEvent } from './appointment-booked-event.util';
import { buildAppointmentCancelledDomainEvent } from './appointment-cancelled-event.util';
import { buildAppointmentRescheduledDomainEvent } from './appointment-rescheduled-event.util';
import { PortalCreateAppointmentDto } from '../../portal/portal-appointments/dto/portal-create-appointment.dto';
import { PortalUpdateAppointmentDto } from '../../portal/portal-appointments/dto/portal-update-appointment.dto';
import { PatientPrincipal } from '../../portal/portal.types';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { PatientEngagementAppointmentService } from '../../engagement/patient-engagement-appointment.service';
import {
  assertAllowedAppointmentStatusTransition,
  assertAppointmentSchedulingMutable,
} from './appointment-status-transition.util';
import { SchedulingPolicyService } from '../scheduling-policy.service';
import { resolveEffectiveBookingRule } from '../resolve-effective-booking-rule.util';
import { assertCancellationWindow } from '../scheduling-booking-policy.util';
import { schedulingNow } from '../scheduling-clock';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  /** When true, audit logs omit staff userId (e.g. patient portal actor). */
  portalActor?: boolean;
};

type AppointmentFilters = {
  patientId?: string;
  branchId?: string;
  status?: AppointmentStatus;
  startAt?: string;
  endAt?: string;
};

const appointmentInclude = {
  patient: true,
  resources: {
    include: {
      resource: true,
    },
  },
} as const;

const NON_BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.COMPLETED,
];

const SCHEDULING_CONFLICT_MESSAGE =
  'Scheduling conflict: one or more selected resources are already booked during this time.';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly patientEngagementAppointmentService: PatientEngagementAppointmentService,
    private readonly schedulingPolicyService: SchedulingPolicyService,
  ) {}

  private async loadResourcesForScheduling(resourceIds: string[]): Promise<Resource[]> {
    return this.prisma.resource.findMany({
      where: { id: { in: resourceIds } },
    });
  }

  private async assertBookingPolicyForAppointment(input: {
    hospitalId: string;
    branchId?: string | null;
    startAt: Date;
    endAt: Date;
    resourceIds: string[];
    now?: Date;
  }): Promise<void> {
    const resources = await this.loadResourcesForScheduling(input.resourceIds);
    await this.schedulingPolicyService.assertAppointmentBookingAllowed(
      this.prisma,
      {
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        startAt: input.startAt,
        endAt: input.endAt,
        resources,
        now: input.now,
      },
    );
  }

  private async emitBookedNotificationInTransaction(
    tx: Prisma.TransactionClient,
    appointment: {
      id: string;
      hospitalId: string;
      branchId: string | null;
      patientId: string;
      startAt: Date;
    },
  ) {
    const outbox = await this.domainEventOutboxService.createInTransaction(
      tx,
      buildAppointmentBookedDomainEvent(appointment),
    );
    await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
      hospitalId: appointment.hospitalId,
      branchId: appointment.branchId,
      outboxId: outbox.id,
    });
  }

  private async emitRescheduledNotificationInTransaction(
    tx: Prisma.TransactionClient,
    appointment: {
      id: string;
      hospitalId: string;
      branchId: string | null;
      patientId: string;
      previousStartAt: Date;
      newStartAt: Date;
    },
  ) {
    const outbox = await this.domainEventOutboxService.createInTransaction(
      tx,
      buildAppointmentRescheduledDomainEvent(appointment),
    );
    await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
      hospitalId: appointment.hospitalId,
      branchId: appointment.branchId,
      outboxId: outbox.id,
    });
  }

  private async emitCancelledNotificationInTransaction(
    tx: Prisma.TransactionClient,
    appointment: {
      id: string;
      hospitalId: string;
      branchId: string | null;
      patientId: string;
      startAt: Date;
    },
  ) {
    const outbox = await this.domainEventOutboxService.createInTransaction(
      tx,
      buildAppointmentCancelledDomainEvent(appointment),
    );
    await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
      hospitalId: appointment.hospitalId,
      branchId: appointment.branchId,
      outboxId: outbox.id,
    });
  }

  private async validateBranch(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'Branch does not belong to your hospital',
      );
    }
  }

  private assertResourcesCompatibleWithBranch(
    resources: Resource[],
    branchId?: string | null,
  ): void {
    if (!branchId) {
      return;
    }

    for (const resource of resources) {
      if (resource.branchId && resource.branchId !== branchId) {
        throw new BadRequestException(
          `Resource ${resource.name} does not belong to the appointment branch`,
        );
      }
    }
  }

  private async validateResources(
    user: AuthenticatedUser,
    resourceIds: string[],
    branchId?: string | null,
  ): Promise<void> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length !== resourceIds.length) {
      throw new BadRequestException('resourceIds must be unique');
    }

    const resources = await this.prisma.resource.findMany({
      where: {
        id: {
          in: resourceIds,
        },
      },
    });

    if (resources.length !== resourceIds.length) {
      throw new NotFoundException('Resource not found');
    }

    for (const resource of resources) {
      if (resource.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Resource not found');
      }

      if (resource.status !== ResourceStatus.ACTIVE) {
        throw new BadRequestException('Resource is not active');
      }
    }

    this.assertResourcesCompatibleWithBranch(resources, branchId);
  }

  private async validatePatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: {
        id: patientId,
      },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.branchId != null) {
      assertBranchAccess(user, patient.branchId);
    }
  }

  private assertValidDateRange(startAt: Date, endAt: Date): void {
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private async acquireResourceAdvisoryLocks(
    tx: Prisma.TransactionClient,
    resourceIds: string[],
  ): Promise<void> {
    const sortedResourceIds = [...new Set(resourceIds)].sort();

    for (const resourceId of sortedResourceIds) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resourceId}))`;
    }
  }

  private async assertNoSchedulingConflict(
    tx: Prisma.TransactionClient,
    params: {
      hospitalId: string;
      branchId?: string | null;
      resourceIds: string[];
      startAt: Date;
      endAt: Date;
      excludeAppointmentId?: string;
    },
  ): Promise<void> {
    const bookingRule = await resolveEffectiveBookingRule(
      tx,
      params.hospitalId,
      params.branchId,
    );
    const conflict = await this.schedulingPolicyService.hasResourceSchedulingConflict(
      tx,
      {
        hospitalId: params.hospitalId,
        resourceIds: params.resourceIds,
        startAt: params.startAt,
        endAt: params.endAt,
        excludeAppointmentId: params.excludeAppointmentId,
        bufferMinutes: bookingRule?.bufferMinutes ?? 0,
      },
    );

    if (conflict) {
      throw new ConflictException(SCHEDULING_CONFLICT_MESSAGE);
    }
  }

  private async findOwnedAppointment(user: AuthenticatedUser, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: appointmentInclude,
    });

    if (!appointment || appointment.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Appointment not found');
    }

    assertBranchAccess(user, appointment.branchId);

    return appointment;
  }

  async create(user: AuthenticatedUser, dto: CreateAppointmentDto) {
    await this.validatePatient(user, dto.patientId);

    const branchId = resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    await this.validateResources(user, dto.resourceIds, branchId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertValidDateRange(startAt, endAt);

    const resourceIds = [...new Set(dto.resourceIds)];

    await this.assertBookingPolicyForAppointment({
      hospitalId: user.hospitalId,
      branchId,
      startAt,
      endAt,
      resourceIds,
    });

    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.acquireResourceAdvisoryLocks(tx, resourceIds);
      await this.assertNoSchedulingConflict(tx, {
        hospitalId: user.hospitalId,
        branchId,
        resourceIds,
        startAt,
        endAt,
      });

      const created = await tx.appointment.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          patientId: dto.patientId,
          startAt,
          endAt,
          reason: dto.reason,
          notes: dto.notes,
        },
      });

      await tx.appointmentResource.createMany({
        data: resourceIds.map((resourceId) => ({
          appointmentId: created.id,
          resourceId,
        })),
      });

      const persisted = await tx.appointment.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: appointmentInclude,
      });

      await this.emitBookedNotificationInTransaction(tx, persisted);

      return persisted;
    });

    await this.auditService.log({
      action: 'APPOINTMENT_CREATED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.portalActor ? undefined : user.sub,
      metadata: user.portalActor ? { actorType: 'PATIENT_PORTAL' } : undefined,
    });

    return appointment;
  }

  async findAll(user: AuthenticatedUser, filters: AppointmentFilters = {}) {
    if (filters.patientId !== undefined) {
      await this.validatePatient(user, filters.patientId);
    }

    if (user.branchId == null && filters.branchId) {
      await this.validateBranch(user, filters.branchId);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      ...(filters.patientId !== undefined && {
        patientId: filters.patientId,
      }),
      ...(filters.branchId !== undefined && { branchId: filters.branchId }),
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.startAt !== undefined && {
        startAt: {
          gte: new Date(filters.startAt),
        },
      }),
      ...(filters.endAt !== undefined && {
        endAt: {
          lte: new Date(filters.endAt),
        },
      }),
    });

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: {
        startAt: 'asc',
      },
    });

    await this.auditService.log({
      action: 'APPOINTMENT_LIST_READ',
      entity: 'Appointment',
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? filters.branchId ?? null,
      userId: user.sub,
      metadata: {
        patientId: filters.patientId ?? null,
        status: filters.status ?? null,
        resultCount: appointments.length,
      },
    });

    return appointments;
  }

  async findOne(user: AuthenticatedUser, appointmentId: string) {
    const appointment = await this.findOwnedAppointment(user, appointmentId);
    await this.auditService.log({
      action: 'APPOINTMENT_READ',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.sub,
      metadata: { patientId: appointment.patientId },
    });
    return appointment;
  }

  async update(
    user: AuthenticatedUser,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ) {
    const existing = await this.findOwnedAppointment(user, appointmentId);

    const resolvedBranchId = resolveUpdateBranchId(user, dto.branchId);
    if (resolvedBranchId) {
      await this.validateBranch(user, resolvedBranchId);
    }

    const nextBranchId =
      resolvedBranchId !== undefined ? resolvedBranchId : existing.branchId;
    const nextStartAt = dto.startAt
      ? new Date(dto.startAt)
      : existing.startAt;
    const nextEndAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    this.assertValidDateRange(nextStartAt, nextEndAt);

    const existingResourceIds = existing.resources.map(
      (appointmentResource) => appointmentResource.resourceId,
    );
    const nextResourceIds = dto.resourceIds ?? existingResourceIds;

    if (dto.resourceIds) {
      await this.validateResources(user, dto.resourceIds, nextBranchId);
    } else if (dto.branchId !== undefined) {
      await this.validateResources(user, existingResourceIds, nextBranchId);
    }

    const schedulingChanged =
      dto.startAt !== undefined ||
      dto.endAt !== undefined ||
      dto.resourceIds !== undefined ||
      dto.branchId !== undefined;

    if (schedulingChanged) {
      assertAppointmentSchedulingMutable(existing.status);
    }

    const statusChanging =
      dto.status !== undefined && dto.status !== existing.status;

    if (dto.status !== undefined) {
      assertAllowedAppointmentStatusTransition(existing.status, dto.status);
    }

    if (schedulingChanged) {
      await this.assertBookingPolicyForAppointment({
        hospitalId: user.hospitalId,
        branchId: nextBranchId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        resourceIds: nextResourceIds,
      });
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      if (statusChanging) {
        const statusTransition = await tx.appointment.updateMany({
          where: {
            id: appointmentId,
            hospitalId: user.hospitalId,
            status: existing.status,
          },
          data: {
            status: dto.status,
          },
        });

        if (statusTransition.count === 0) {
          throw new ConflictException(
            'Appointment status was updated concurrently or is no longer valid for this change.',
          );
        }
      }

      if (schedulingChanged) {
        const lockResourceIds = [
          ...new Set([...existingResourceIds, ...nextResourceIds]),
        ];

        await this.acquireResourceAdvisoryLocks(tx, lockResourceIds);
        await this.assertNoSchedulingConflict(tx, {
          hospitalId: user.hospitalId,
          branchId: nextBranchId,
          resourceIds: nextResourceIds,
          startAt: nextStartAt,
          endAt: nextEndAt,
          excludeAppointmentId: appointmentId,
        });
      }

      await tx.appointment.update({
        where: {
          id: appointmentId,
        },
        data: {
          ...(dto.startAt !== undefined && { startAt: nextStartAt }),
          ...(dto.endAt !== undefined && { endAt: nextEndAt }),
          ...(resolvedBranchId !== undefined && { branchId: resolvedBranchId }),
          ...(dto.reason !== undefined && { reason: dto.reason }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });

      if (dto.resourceIds) {
        await tx.appointmentResource.deleteMany({
          where: {
            appointmentId,
          },
        });

        await tx.appointmentResource.createMany({
          data: nextResourceIds.map((resourceId) => ({
            appointmentId,
            resourceId,
          })),
        });
      }

      const persisted = await tx.appointment.findUniqueOrThrow({
        where: {
          id: appointmentId,
        },
        include: appointmentInclude,
      });

      const startChanged =
        dto.startAt !== undefined &&
        existing.startAt.getTime() !== persisted.startAt.getTime();
      if (startChanged) {
        await this.emitRescheduledNotificationInTransaction(tx, {
          id: persisted.id,
          hospitalId: persisted.hospitalId,
          branchId: persisted.branchId,
          patientId: persisted.patientId,
          previousStartAt: existing.startAt,
          newStartAt: persisted.startAt,
        });
      }

      await this.patientEngagementAppointmentService.enqueueNpsTriggerIfNewlyCompleted(
        tx,
        {
          previousStatus: existing.status,
          appointment: {
            id: persisted.id,
            hospitalId: persisted.hospitalId,
            branchId: persisted.branchId,
            patientId: persisted.patientId,
            status: persisted.status,
          },
        },
      );

      return persisted;
    });

    await this.auditService.log({
      action: 'APPOINTMENT_UPDATED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.portalActor ? undefined : user.sub,
      metadata: user.portalActor ? { actorType: 'PATIENT_PORTAL' } : undefined,
    });

    return appointment;
  }

  async cancel(user: AuthenticatedUser, appointmentId: string) {
    const existing = await this.findOwnedAppointment(user, appointmentId);

    if (existing.status === AppointmentStatus.SCHEDULED) {
      const bookingRule = await resolveEffectiveBookingRule(
        this.prisma,
        user.hospitalId,
        existing.branchId,
      );
      if (bookingRule) {
        assertCancellationWindow(
          existing.startAt,
          bookingRule.cancellationWindowMinutes,
          schedulingNow(),
        );
      }
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          hospitalId: user.hospitalId,
          status: AppointmentStatus.SCHEDULED,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
        },
      });

      const updated = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        include: appointmentInclude,
      });

      if (transition.count === 1) {
        await this.emitCancelledNotificationInTransaction(tx, {
          id: updated.id,
          hospitalId: updated.hospitalId,
          branchId: updated.branchId,
          patientId: updated.patientId,
          startAt: existing.startAt,
        });
      } else if (updated.status !== AppointmentStatus.CANCELLED) {
        throw new BadRequestException(
          `Cannot cancel appointment in ${updated.status} status.`,
        );
      }

      return updated;
    });

    await this.auditService.log({
      action: 'APPOINTMENT_CANCELLED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.portalActor ? undefined : user.sub,
      metadata: user.portalActor ? { actorType: 'PATIENT_PORTAL' } : undefined,
    });

    return appointment;
  }

  async createForPortalPatient(
    principal: PatientPrincipal,
    dto: PortalCreateAppointmentDto,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: principal.patientId, hospitalId: principal.hospitalId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const branchId = this.resolvePortalCreateBranchId(
      patient.branchId,
      dto.branchId,
    );

    const staffUser: AuthenticatedUser = {
      sub: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: null,
      portalActor: true,
    };

    const created = await this.create(staffUser, {
      patientId: principal.patientId,
      branchId: branchId ?? undefined,
      resourceIds: dto.resourceIds,
      startAt: dto.startAt,
      endAt: dto.endAt,
      reason: dto.reason,
    });

    return this.toPortalAppointmentResponse(created);
  }

  async findAllForPortalPatient(
    principal: PatientPrincipal,
    filters: {
      from?: string;
      to?: string;
      status?: AppointmentStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = Math.min(
      filters.limit && filters.limit > 0 ? filters.limit : 50,
      100,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      hospitalId: principal.hospitalId,
      patientId: principal.patientId,
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.from !== undefined && {
        startAt: { gte: new Date(filters.from) },
      }),
      ...(filters.to !== undefined && {
        endAt: { lte: new Date(filters.to) },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: { startAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      items: items.map((row) => this.toPortalAppointmentResponse(row)),
      page,
      limit,
      total,
    };
  }

  async findOneForPortalPatient(
    principal: PatientPrincipal,
    appointmentId: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return this.toPortalAppointmentResponse(appointment);
  }

  async updateForPortalPatient(
    principal: PatientPrincipal,
    appointmentId: string,
    dto: PortalUpdateAppointmentDto,
  ) {
    const existing = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    const staffUser: AuthenticatedUser = {
      sub: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: null,
      portalActor: true,
    };

    const updated = await this.update(staffUser, appointmentId, {
      startAt: dto.startAt,
      endAt: dto.endAt,
      resourceIds: dto.resourceIds,
      reason: dto.reason,
    });

    return this.toPortalAppointmentResponse(updated);
  }

  async cancelForPortalPatient(
    principal: PatientPrincipal,
    appointmentId: string,
  ) {
    const existing = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    const staffUser: AuthenticatedUser = {
      sub: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: null,
      portalActor: true,
    };

    const cancelled = await this.cancel(staffUser, appointmentId);
    return this.toPortalAppointmentResponse(cancelled);
  }

  async findAvailableSlotsForPortal(params: {
    hospitalId: string;
    branchId?: string | null;
    resourceIds: string[];
    date: string;
    durationMinutes?: number;
  }) {
    const scopeUser: AuthenticatedUser = {
      sub: 'portal-slot',
      hospitalId: params.hospitalId,
      branchId: null,
    };

    await this.validateResources(
      scopeUser,
      params.resourceIds,
      params.branchId ?? undefined,
    );

    const bookingRule = await resolveEffectiveBookingRule(
      this.prisma,
      params.hospitalId,
      params.branchId ?? undefined,
    );
    const slotMinutes = bookingRule?.slotDurationMinutes ?? 15;
    const durationMinutes = params.durationMinutes ?? slotMinutes;

    if (bookingRule) {
      if (durationMinutes < bookingRule.minDurationMinutes) {
        throw new BadRequestException(
          `Duration must be at least ${bookingRule.minDurationMinutes} minutes`,
        );
      }
      if (durationMinutes > bookingRule.maxDurationMinutes) {
        throw new BadRequestException(
          `Duration must not exceed ${bookingRule.maxDurationMinutes} minutes`,
        );
      }
      if (durationMinutes % bookingRule.slotDurationMinutes !== 0) {
        throw new BadRequestException(
          `Duration must be a multiple of ${bookingRule.slotDurationMinutes} minutes`,
        );
      }
    }

    const generated = await this.schedulingPolicyService.generatePortalAvailableSlots(
      {
        hospitalId: params.hospitalId,
        branchId: params.branchId ?? null,
        resourceIds: params.resourceIds,
        date: params.date.slice(0, 10),
        slotDurationMinutes: slotMinutes,
        durationMinutes,
      },
    );

    const schedule = await this.schedulingPolicyService.resolveBranchWorkSchedule(
      this.prisma,
      params.hospitalId,
      params.branchId ?? undefined,
    );
    const dateAnchor =
      schedule != null
        ? params.date.slice(0, 10)
        : new Date(params.date).toISOString();

    return {
      date: dateAnchor,
      slotDurationMinutes: slotMinutes,
      durationMinutes,
      resourceIds: params.resourceIds,
      slots: generated.slots,
      note: generated.note,
      ...(generated.timezoneUsed && { timezone: generated.timezoneUsed }),
    };
  }

  private resolvePortalCreateBranchId(
    patientBranchId: string | null,
    dtoBranchId?: string,
  ): string | null | undefined {
    if (patientBranchId != null) {
      if (dtoBranchId !== undefined && dtoBranchId !== patientBranchId) {
        throw new ForbiddenException('Access to this branch is not permitted');
      }
      return patientBranchId;
    }
    return dtoBranchId ?? null;
  }

  private toPortalAppointmentResponse(
    appointment: Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>,
  ) {
    return {
      id: appointment.id,
      hospitalId: appointment.hospitalId,
      branchId: appointment.branchId,
      patientId: appointment.patientId,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      status: appointment.status,
      reason: appointment.reason,
      resources: appointment.resources.map((link) => ({
        id: link.resource.id,
        name: link.resource.name,
        type: link.resource.type,
      })),
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }
}
