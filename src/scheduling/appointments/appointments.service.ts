import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  BookingRule,
  Prisma,
  Resource,
  ResourceStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
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
  ) {}

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
  }

  private assertValidDateRange(startAt: Date, endAt: Date): void {
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private async resolveEffectiveBookingRule(
    hospitalId: string,
    branchId?: string | null,
  ): Promise<BookingRule | null> {
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: {
          id: branchId,
        },
        include: {
          bookingRule: true,
        },
      });

      if (!branch || branch.hospitalId !== hospitalId) {
        return null;
      }

      if (branch.bookingRule) {
        if (branch.bookingRule.hospitalId !== hospitalId) {
          return null;
        }

        return branch.bookingRule;
      }
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: hospitalId,
      },
      include: {
        defaultBookingRule: true,
      },
    });

    if (!hospital?.defaultBookingRule) {
      return null;
    }

    if (hospital.defaultBookingRule.hospitalId !== hospitalId) {
      return null;
    }

    return hospital.defaultBookingRule;
  }

  private assertBookingRuleDuration(
    startAt: Date,
    endAt: Date,
    rule: BookingRule,
  ): void {
    const durationMinutes = Math.round(
      (endAt.getTime() - startAt.getTime()) / 60000,
    );

    if (durationMinutes < rule.minDurationMinutes) {
      throw new BadRequestException(
        `Appointment duration must be at least ${rule.minDurationMinutes} minutes.`,
      );
    }

    if (durationMinutes > rule.maxDurationMinutes) {
      throw new BadRequestException(
        `Appointment duration must not exceed ${rule.maxDurationMinutes} minutes.`,
      );
    }

    if (durationMinutes % rule.slotDurationMinutes !== 0) {
      throw new BadRequestException(
        `Appointment duration must be a multiple of ${rule.slotDurationMinutes} minutes.`,
      );
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
      resourceIds: string[];
      startAt: Date;
      endAt: Date;
      excludeAppointmentId?: string;
    },
  ): Promise<void> {
    const conflict = await tx.appointment.findFirst({
      where: {
        hospitalId: params.hospitalId,
        ...(params.excludeAppointmentId && {
          id: {
            not: params.excludeAppointmentId,
          },
        }),
        status: {
          notIn: NON_BLOCKING_APPOINTMENT_STATUSES,
        },
        startAt: {
          lt: params.endAt,
        },
        endAt: {
          gt: params.startAt,
        },
        resources: {
          some: {
            resourceId: {
              in: params.resourceIds,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

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

    return appointment;
  }

  async create(user: AuthenticatedUser, dto: CreateAppointmentDto) {
    await this.validatePatient(user, dto.patientId);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    await this.validateResources(user, dto.resourceIds, dto.branchId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertValidDateRange(startAt, endAt);

    const bookingRule = await this.resolveEffectiveBookingRule(
      user.hospitalId,
      dto.branchId,
    );
    if (bookingRule) {
      this.assertBookingRuleDuration(startAt, endAt, bookingRule);
    }

    const resourceIds = [...new Set(dto.resourceIds)];

    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.acquireResourceAdvisoryLocks(tx, resourceIds);
      await this.assertNoSchedulingConflict(tx, {
        hospitalId: user.hospitalId,
        resourceIds,
        startAt,
        endAt,
      });

      const created = await tx.appointment.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: dto.branchId,
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

      return tx.appointment.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: appointmentInclude,
      });
    });

    await this.auditService.log({
      action: 'APPOINTMENT_CREATED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.sub,
    });

    return appointment;
  }

  async findAll(user: AuthenticatedUser, filters: AppointmentFilters = {}) {
    return this.prisma.appointment.findMany({
      where: {
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
      },
      include: appointmentInclude,
      orderBy: {
        startAt: 'asc',
      },
    });
  }

  async findOne(user: AuthenticatedUser, appointmentId: string) {
    return this.findOwnedAppointment(user, appointmentId);
  }

  async update(
    user: AuthenticatedUser,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ) {
    const existing = await this.findOwnedAppointment(user, appointmentId);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const nextBranchId =
      dto.branchId !== undefined ? dto.branchId : existing.branchId;
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

    const bookingRuleTimingChanged =
      dto.startAt !== undefined ||
      dto.endAt !== undefined ||
      dto.branchId !== undefined;

    if (bookingRuleTimingChanged) {
      const bookingRule = await this.resolveEffectiveBookingRule(
        user.hospitalId,
        nextBranchId,
      );
      if (bookingRule) {
        this.assertBookingRuleDuration(nextStartAt, nextEndAt, bookingRule);
      }
    }

    const schedulingChanged =
      dto.startAt !== undefined ||
      dto.endAt !== undefined ||
      dto.resourceIds !== undefined ||
      dto.branchId !== undefined;

    const appointment = await this.prisma.$transaction(async (tx) => {
      if (schedulingChanged) {
        const lockResourceIds = [
          ...new Set([...existingResourceIds, ...nextResourceIds]),
        ];

        await this.acquireResourceAdvisoryLocks(tx, lockResourceIds);
        await this.assertNoSchedulingConflict(tx, {
          hospitalId: user.hospitalId,
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
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
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

      return tx.appointment.findUniqueOrThrow({
        where: {
          id: appointmentId,
        },
        include: appointmentInclude,
      });
    });

    await this.auditService.log({
      action: 'APPOINTMENT_UPDATED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.sub,
    });

    return appointment;
  }

  async cancel(user: AuthenticatedUser, appointmentId: string) {
    await this.findOwnedAppointment(user, appointmentId);

    const appointment = await this.prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
      include: appointmentInclude,
    });

    await this.auditService.log({
      action: 'APPOINTMENT_CANCELLED',
      entity: 'Appointment',
      entityId: appointment.id,
      hospitalId: user.hospitalId,
      branchId: appointment.branchId,
      userId: user.sub,
    });

    return appointment;
  }
}
