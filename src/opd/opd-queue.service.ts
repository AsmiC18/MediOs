import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  OpdQueueEntry,
  OpdQueuePriority,
  OpdQueueStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { QueueQueryDto } from './dto/queue-query.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import {
  endOfQueueDate,
  parseQueueDateInput,
  startOfQueueDate,
  toQueueDate,
} from './utils/opd-date.util';
import { isAllowedOpdQueueTransition } from './utils/opd-queue-transitions.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const ACTIVE_OPD_QUEUE_STATUSES: OpdQueueStatus[] = [
  OpdQueueStatus.WAITING,
  OpdQueueStatus.CALLED,
  OpdQueueStatus.IN_CONSULTATION,
];

const BLOCKING_OPD_QUEUE_STATUSES: OpdQueueStatus[] = [
  ...ACTIVE_OPD_QUEUE_STATUSES,
  OpdQueueStatus.COMPLETED,
  OpdQueueStatus.NO_SHOW,
];

const MAX_TOKEN_RETRIES = 3;

const queueInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  appointment: {
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      reason: true,
      resources: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OpdQueueEntryInclude;

@Injectable()
export class OpdQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private formatEntry(entry: Prisma.OpdQueueEntryGetPayload<{
    include: typeof queueInclude;
  }>) {
    return {
      id: entry.id,
      hospitalId: entry.hospitalId,
      branchId: entry.branchId,
      appointmentId: entry.appointmentId,
      patientId: entry.patientId,
      queueDate: entry.queueDate,
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      priority: entry.priority,
      checkedInAt: entry.checkedInAt,
      calledAt: entry.calledAt,
      consultationStartedAt: entry.consultationStartedAt,
      completedAt: entry.completedAt,
      noShowAt: entry.noShowAt,
      notes: entry.notes,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      patient: entry.patient,
      appointment: entry.appointment,
    };
  }

  private async findOwnedQueueEntry(user: AuthenticatedUser, queueId: string) {
    const entry = await this.prisma.opdQueueEntry.findUnique({
      where: { id: queueId },
      include: queueInclude,
    });

    if (!entry || entry.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Queue entry not found');
    }

    assertBranchAccess(user, entry.branchId);

    return entry;
  }

  private assertValidTransition(
    currentStatus: OpdQueueStatus,
    nextStatus: OpdQueueStatus,
  ): void {
    if (!isAllowedOpdQueueTransition(currentStatus, nextStatus)) {
      throw new BadRequestException(
        `Invalid queue transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async generateNextTokenNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
    queueDate: Date,
  ): Promise<number> {
    const lockKey = `opd-token:${hospitalId}:${queueDate.toISOString().slice(0, 10)}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const latest = await tx.opdQueueEntry.findFirst({
      where: {
        hospitalId,
        queueDate: startOfQueueDate(queueDate),
      },
      orderBy: {
        tokenNumber: 'desc',
      },
      select: {
        tokenNumber: true,
      },
    });

    return (latest?.tokenNumber ?? 0) + 1;
  }

  private async assertAppointmentEligibleForCheckIn(
    appointment: {
      id: string;
      hospitalId: string;
      patientId: string;
      branchId: string | null;
      status: AppointmentStatus;
      startAt: Date;
    },
    hospitalId: string,
  ): Promise<void> {
    if (appointment.hospitalId !== hospitalId) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cancelled appointments cannot be checked in');
    }

    if (appointment.status === AppointmentStatus.NO_SHOW) {
      throw new BadRequestException('No-show appointments cannot be checked in');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Completed appointments cannot be checked in');
    }

    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw new BadRequestException('Appointment is not eligible for OPD check-in');
    }

    const existing = await this.prisma.opdQueueEntry.findFirst({
      where: {
        hospitalId,
        appointmentId: appointment.id,
        status: {
          in: BLOCKING_OPD_QUEUE_STATUSES,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Appointment is already checked in to the OPD queue');
    }
  }

  async checkIn(user: AuthenticatedUser, dto: CheckInDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    await this.assertAppointmentEligibleForCheckIn(appointment, user.hospitalId);
    assertBranchAccess(user, appointment.branchId);

    const queueDate = toQueueDate(appointment.startAt);
    const now = new Date();

    let entry;

    for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt += 1) {
      try {
        entry = await this.prisma.$transaction(async (tx) => {
          const tokenNumber = await this.generateNextTokenNumber(
            tx,
            user.hospitalId,
            queueDate,
          );

          return tx.opdQueueEntry.create({
            data: {
              hospitalId: user.hospitalId,
              branchId: appointment.branchId,
              appointmentId: appointment.id,
              patientId: appointment.patientId,
              queueDate,
              tokenNumber,
              status: OpdQueueStatus.WAITING,
              priority: OpdQueuePriority.NORMAL,
              checkedInAt: now,
            },
            include: queueInclude,
          });
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_TOKEN_RETRIES - 1
        ) {
          continue;
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Token generation conflict; please retry check-in');
        }

        throw error;
      }
    }

    if (!entry) {
      throw new ConflictException('Failed to create queue entry');
    }

    await this.auditService.log({
      action: 'OPD_QUEUE_CHECKED_IN',
      entity: 'OpdQueueEntry',
      entityId: entry.id,
      hospitalId: user.hospitalId,
      branchId: entry.branchId,
      userId: user.sub,
      metadata: {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        tokenNumber: entry.tokenNumber,
        queueDate: queueDate.toISOString().slice(0, 10),
      },
    });

    return this.formatEntry(entry);
  }

  async listQueue(user: AuthenticatedUser, query: QueueQueryDto = {}) {
    let queueDate: Date;

    try {
      queueDate = query.date
        ? parseQueueDateInput(query.date)
        : toQueueDate(new Date());
    } catch {
      throw new BadRequestException('Invalid queue date filter');
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      queueDate: {
        gte: startOfQueueDate(queueDate),
        lt: endOfQueueDate(queueDate),
      },
      ...(query.branchId !== undefined && { branchId: query.branchId }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.priority !== undefined && { priority: query.priority }),
      ...(query.appointmentId !== undefined && {
        appointmentId: query.appointmentId,
      }),
      ...(query.patientId !== undefined && { patientId: query.patientId }),
    });

    const entries = await this.prisma.opdQueueEntry.findMany({
      where,
      include: queueInclude,
      orderBy: [{ priority: 'desc' }, { tokenNumber: 'asc' }],
    });

    return entries.map((entry) => this.formatEntry(entry));
  }

  async getQueueEntry(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.formatEntry(entry);
  }

  private async applyTransition(
    user: AuthenticatedUser,
    entry: OpdQueueEntry,
    nextStatus: OpdQueueStatus,
    auditAction: string,
  ) {
    this.assertValidTransition(entry.status, nextStatus);

    const now = new Date();
    const timestampData: Prisma.OpdQueueEntryUpdateInput = {};

    if (nextStatus === OpdQueueStatus.CALLED) {
      timestampData.calledAt = now;
    } else if (nextStatus === OpdQueueStatus.IN_CONSULTATION) {
      timestampData.consultationStartedAt = now;
    } else if (nextStatus === OpdQueueStatus.COMPLETED) {
      timestampData.completedAt = now;
    } else if (nextStatus === OpdQueueStatus.NO_SHOW) {
      timestampData.noShowAt = now;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const queueEntry = await tx.opdQueueEntry.update({
        where: { id: entry.id },
        data: {
          status: nextStatus,
          ...timestampData,
        },
        include: queueInclude,
      });

      if (nextStatus === OpdQueueStatus.COMPLETED) {
        await tx.appointment.updateMany({
          where: {
            id: entry.appointmentId,
            hospitalId: user.hospitalId,
            status: AppointmentStatus.SCHEDULED,
          },
          data: {
            status: AppointmentStatus.COMPLETED,
          },
        });
      }

      if (nextStatus === OpdQueueStatus.NO_SHOW) {
        await tx.appointment.updateMany({
          where: {
            id: entry.appointmentId,
            hospitalId: user.hospitalId,
            status: AppointmentStatus.SCHEDULED,
          },
          data: {
            status: AppointmentStatus.NO_SHOW,
          },
        });
      }

      return queueEntry;
    });

    await this.auditService.log({
      action: auditAction,
      entity: 'OpdQueueEntry',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        previousStatus: entry.status,
        newStatus: nextStatus,
        appointmentId: entry.appointmentId,
        patientId: entry.patientId,
        tokenNumber: entry.tokenNumber,
      },
    });

    return this.formatEntry(updated);
  }

  async callPatient(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.applyTransition(
      user,
      entry,
      OpdQueueStatus.CALLED,
      'OPD_QUEUE_CALLED',
    );
  }

  async startConsultation(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.applyTransition(
      user,
      entry,
      OpdQueueStatus.IN_CONSULTATION,
      'OPD_QUEUE_CONSULTATION_STARTED',
    );
  }

  async completeConsultation(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.applyTransition(
      user,
      entry,
      OpdQueueStatus.COMPLETED,
      'OPD_QUEUE_COMPLETED',
    );
  }

  async markNoShow(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.applyTransition(
      user,
      entry,
      OpdQueueStatus.NO_SHOW,
      'OPD_QUEUE_NO_SHOW',
    );
  }

  async cancelQueueEntry(user: AuthenticatedUser, queueId: string) {
    const entry = await this.findOwnedQueueEntry(user, queueId);
    return this.applyTransition(
      user,
      entry,
      OpdQueueStatus.CANCELLED,
      'OPD_QUEUE_CANCELLED',
    );
  }

  async updatePriority(
    user: AuthenticatedUser,
    queueId: string,
    dto: UpdatePriorityDto,
  ) {
    const entry = await this.findOwnedQueueEntry(user, queueId);

    if (
      entry.status === OpdQueueStatus.COMPLETED ||
      entry.status === OpdQueueStatus.NO_SHOW ||
      entry.status === OpdQueueStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot update priority for a terminal queue entry',
      );
    }

    const updated = await this.prisma.opdQueueEntry.update({
      where: { id: entry.id },
      data: {
        priority: dto.priority,
      },
      include: queueInclude,
    });

    await this.auditService.log({
      action: 'OPD_QUEUE_PRIORITY_UPDATED',
      entity: 'OpdQueueEntry',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        previousPriority: entry.priority,
        newPriority: dto.priority,
        appointmentId: entry.appointmentId,
        patientId: entry.patientId,
        tokenNumber: entry.tokenNumber,
      },
    });

    return this.formatEntry(updated);
  }
}
