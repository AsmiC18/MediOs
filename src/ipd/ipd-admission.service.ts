import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BedStatus,
  IpdAdmissionStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdmissionQueryDto } from './dto/admission-query.dto';
import { AllocateBedDto } from './dto/allocate-bed.dto';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { TransferBedDto } from './dto/transfer-bed.dto';
import {
  assertBedAvailableForAllocation,
  lockBedRow,
  lockBedsInOrder,
  occupyBed,
  releaseBed,
} from './utils/bed-lock.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const MAX_ADMISSION_NUMBER_RETRIES = 3;

const admissionInclude = {
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
  assignments: {
    include: {
      bed: {
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      },
    },
    orderBy: { assignedAt: 'asc' as const },
  },
} satisfies Prisma.IpdAdmissionInclude;

@Injectable()
export class IpdAdmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private formatAdmission(
    admission: Prisma.IpdAdmissionGetPayload<{ include: typeof admissionInclude }>,
  ) {
    const currentAssignment =
      admission.assignments.find((assignment) => assignment.releasedAt === null) ??
      null;

    return {
      id: admission.id,
      hospitalId: admission.hospitalId,
      branchId: admission.branchId,
      patientId: admission.patientId,
      admissionNumber: admission.admissionNumber,
      admissionDate: admission.admissionDate,
      dischargeDate: admission.dischargeDate,
      status: admission.status,
      reason: admission.reason,
      notes: admission.notes,
      createdAt: admission.createdAt,
      updatedAt: admission.updatedAt,
      patient: admission.patient,
      branch: admission.branch,
      currentBed: currentAssignment?.bed ?? null,
      currentAssignment: currentAssignment
        ? {
            id: currentAssignment.id,
            bedId: currentAssignment.bedId,
            assignedAt: currentAssignment.assignedAt,
            reason: currentAssignment.reason,
          }
        : null,
      bedHistory: admission.assignments.map((assignment) => ({
        id: assignment.id,
        bedId: assignment.bedId,
        bed: assignment.bed,
        assignedAt: assignment.assignedAt,
        releasedAt: assignment.releasedAt,
        reason: assignment.reason,
      })),
    };
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

    return patient;
  }

  private async assertNoActiveAdmission(
    hospitalId: string,
    patientId: string,
  ): Promise<void> {
    const active = await this.prisma.ipdAdmission.findFirst({
      where: {
        hospitalId,
        patientId,
        status: IpdAdmissionStatus.ADMITTED,
      },
    });

    if (active) {
      throw new ConflictException('Patient already has an active admission');
    }
  }

  private async generateAdmissionNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    const latest = await tx.ipdAdmission.findFirst({
      where: { hospitalId },
      orderBy: { admissionNumber: 'desc' },
      select: { admissionNumber: true },
    });

    let sequence = 1;

    if (latest?.admissionNumber) {
      const match = /^ADM-(\d+)$/.exec(latest.admissionNumber);

      if (match) {
        sequence = parseInt(match[1], 10) + 1;
      }
    }

    return `ADM-${String(sequence).padStart(6, '0')}`;
  }

  private async findOwnedAdmission(user: AuthenticatedUser, admissionId: string) {
    const admission = await this.prisma.ipdAdmission.findUnique({
      where: { id: admissionId },
      include: admissionInclude,
    });

    if (!admission || admission.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Admission not found');
    }

    return admission;
  }

  private async validateBedForBranch(
    user: AuthenticatedUser,
    bedId: string,
    branchId: string,
  ) {
    const bed = await this.prisma.ipdBed.findUnique({
      where: { id: bedId },
    });

    if (!bed || bed.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Bed not found');
    }

    if (bed.branchId !== branchId) {
      throw new BadRequestException('Bed must belong to the same branch as the admission');
    }

    return bed;
  }

  private async getActiveAssignment(
    tx: Prisma.TransactionClient,
    admissionId: string,
  ) {
    return tx.ipdBedAssignment.findFirst({
      where: {
        admissionId,
        releasedAt: null,
      },
    });
  }

  private async createBedAssignment(
    tx: Prisma.TransactionClient,
    input: {
      hospitalId: string;
      admissionId: string;
      bedId: string;
      reason?: string;
    },
  ) {
    const active = await this.getActiveAssignment(tx, input.admissionId);

    if (active) {
      throw new ConflictException('Admission already has an allocated bed');
    }

    await occupyBed(tx, input.bedId);

    return tx.ipdBedAssignment.create({
      data: {
        hospitalId: input.hospitalId,
        admissionId: input.admissionId,
        bedId: input.bedId,
        reason: input.reason,
      },
    });
  }

  async createAdmission(user: AuthenticatedUser, dto: CreateAdmissionDto) {
    await this.validatePatient(user, dto.patientId);
    await this.validateBranch(user, dto.branchId);
    await this.assertNoActiveAdmission(user.hospitalId, dto.patientId);

    if (dto.bedId) {
      await this.validateBedForBranch(user, dto.bedId, dto.branchId);
    }

    let admission;

    for (let attempt = 0; attempt < MAX_ADMISSION_NUMBER_RETRIES; attempt += 1) {
      try {
        admission = await this.prisma.$transaction(async (tx) => {
          const admissionNumber = await this.generateAdmissionNumber(
            tx,
            user.hospitalId,
          );

          const created = await tx.ipdAdmission.create({
            data: {
              hospitalId: user.hospitalId,
              branchId: dto.branchId,
              patientId: dto.patientId,
              admissionNumber,
              reason: dto.reason,
              notes: dto.notes,
              status: IpdAdmissionStatus.ADMITTED,
            },
          });

          if (dto.bedId) {
            await this.createBedAssignment(tx, {
              hospitalId: user.hospitalId,
              admissionId: created.id,
              bedId: dto.bedId,
              reason: 'Initial admission allocation',
            });
          }

          return tx.ipdAdmission.findUniqueOrThrow({
            where: { id: created.id },
            include: admissionInclude,
          });
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_ADMISSION_NUMBER_RETRIES - 1
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!admission) {
      throw new ConflictException('Failed to create admission');
    }

    const formatted = this.formatAdmission(admission);

    await this.auditService.log({
      action: 'IPD_ADMISSION_CREATED',
      entity: 'IpdAdmission',
      entityId: formatted.id,
      hospitalId: user.hospitalId,
      branchId: formatted.branchId,
      userId: user.sub,
      metadata: {
        admissionNumber: formatted.admissionNumber,
        patientId: formatted.patientId,
        bedId: dto.bedId ?? null,
      },
    });

    if (dto.bedId && formatted.currentAssignment) {
      await this.auditService.log({
        action: 'IPD_BED_ALLOCATED',
        entity: 'IpdBedAssignment',
        entityId: formatted.currentAssignment.id,
        hospitalId: user.hospitalId,
        branchId: formatted.branchId,
        userId: user.sub,
        metadata: {
          admissionId: formatted.id,
          bedId: dto.bedId,
        },
      });
    }

    return formatted;
  }

  async listAdmissions(user: AuthenticatedUser, query: AdmissionQueryDto = {}) {
    const admissions = await this.prisma.ipdAdmission.findMany({
      where: {
        hospitalId: user.hospitalId,
        ...(query.branchId !== undefined && { branchId: query.branchId }),
        ...(query.patientId !== undefined && { patientId: query.patientId }),
        ...(query.status !== undefined && { status: query.status }),
      },
      include: admissionInclude,
      orderBy: { admissionDate: 'desc' },
    });

    return admissions.map((admission) => this.formatAdmission(admission));
  }

  async getAdmission(user: AuthenticatedUser, admissionId: string) {
    const admission = await this.findOwnedAdmission(user, admissionId);
    return this.formatAdmission(admission);
  }

  async allocateBed(
    user: AuthenticatedUser,
    admissionId: string,
    dto: AllocateBedDto,
  ) {
    const admission = await this.findOwnedAdmission(user, admissionId);

    if (admission.status !== IpdAdmissionStatus.ADMITTED) {
      throw new BadRequestException('Only active admissions can be allocated a bed');
    }

    await this.validateBedForBranch(user, dto.bedId, admission.branchId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const freshAdmission = await tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
      });

      if (freshAdmission.status !== IpdAdmissionStatus.ADMITTED) {
        throw new BadRequestException('Only active admissions can be allocated a bed');
      }

      const assignment = await this.createBedAssignment(tx, {
        hospitalId: user.hospitalId,
        admissionId,
        bedId: dto.bedId,
        reason: dto.reason,
      });

      return tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
        include: admissionInclude,
      });
    });

    await this.auditService.log({
      action: 'IPD_BED_ALLOCATED',
      entity: 'IpdBedAssignment',
      entityId: updated.assignments.find((a) => a.releasedAt === null)?.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        admissionId,
        bedId: dto.bedId,
      },
    });

    return this.formatAdmission(updated);
  }

  async transferBed(
    user: AuthenticatedUser,
    admissionId: string,
    dto: TransferBedDto,
  ) {
    const admission = await this.findOwnedAdmission(user, admissionId);

    if (admission.status !== IpdAdmissionStatus.ADMITTED) {
      throw new BadRequestException('Only active admissions can be transferred');
    }

    const currentAssignment = admission.assignments.find(
      (assignment) => assignment.releasedAt === null,
    );

    if (!currentAssignment) {
      throw new BadRequestException('Admission has no current bed to transfer from');
    }

    if (currentAssignment.bedId === dto.newBedId) {
      throw new BadRequestException('Patient is already assigned to this bed');
    }

    await this.validateBedForBranch(user, dto.newBedId, admission.branchId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const activeAssignment = await this.getActiveAssignment(tx, admissionId);

      if (!activeAssignment) {
        throw new BadRequestException('Admission has no current bed to transfer from');
      }

      await lockBedsInOrder(tx, [activeAssignment.bedId, dto.newBedId]);

      const newBed = await lockBedRow(tx, dto.newBedId);
      assertBedAvailableForAllocation(newBed);

      const now = new Date();

      await tx.ipdBedAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          releasedAt: now,
          reason: dto.reason ?? 'Bed transfer',
        },
      });

      await releaseBed(tx, activeAssignment.bedId);
      await occupyBed(tx, dto.newBedId);

      await tx.ipdBedAssignment.create({
        data: {
          hospitalId: user.hospitalId,
          admissionId,
          bedId: dto.newBedId,
          reason: dto.reason ?? 'Bed transfer',
        },
      });

      return tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
        include: admissionInclude,
      });
    });

    await this.auditService.log({
      action: 'IPD_BED_TRANSFERRED',
      entity: 'IpdAdmission',
      entityId: admissionId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        fromBedId: currentAssignment.bedId,
        toBedId: dto.newBedId,
        reason: dto.reason ?? null,
      },
    });

    return this.formatAdmission(updated);
  }

  async discharge(user: AuthenticatedUser, admissionId: string) {
    const admission = await this.findOwnedAdmission(user, admissionId);

    if (admission.status !== IpdAdmissionStatus.ADMITTED) {
      throw new BadRequestException('Only active admissions can be discharged');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
      });

      if (fresh.status !== IpdAdmissionStatus.ADMITTED) {
        throw new BadRequestException('Only active admissions can be discharged');
      }

      const activeAssignment = await this.getActiveAssignment(tx, admissionId);
      const now = new Date();

      if (activeAssignment) {
        await tx.ipdBedAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            releasedAt: now,
            reason: 'Discharge',
          },
        });

        await releaseBed(tx, activeAssignment.bedId);
      }

      await tx.ipdAdmission.update({
        where: { id: admissionId },
        data: {
          status: IpdAdmissionStatus.DISCHARGED,
          dischargeDate: now,
        },
      });

      return tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
        include: admissionInclude,
      });
    });

    await this.auditService.log({
      action: 'IPD_ADMISSION_DISCHARGED',
      entity: 'IpdAdmission',
      entityId: admissionId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        admissionNumber: updated.admissionNumber,
        patientId: updated.patientId,
      },
    });

    return this.formatAdmission(updated);
  }

  async cancelAdmission(user: AuthenticatedUser, admissionId: string) {
    const admission = await this.findOwnedAdmission(user, admissionId);

    if (admission.status !== IpdAdmissionStatus.ADMITTED) {
      throw new BadRequestException('Only active admissions can be cancelled');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const activeAssignment = await this.getActiveAssignment(tx, admissionId);
      const now = new Date();

      if (activeAssignment) {
        await tx.ipdBedAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            releasedAt: now,
            reason: 'Admission cancelled',
          },
        });

        await releaseBed(tx, activeAssignment.bedId);
      }

      await tx.ipdAdmission.update({
        where: { id: admissionId },
        data: {
          status: IpdAdmissionStatus.CANCELLED,
        },
      });

      return tx.ipdAdmission.findUniqueOrThrow({
        where: { id: admissionId },
        include: admissionInclude,
      });
    });

    await this.auditService.log({
      action: 'IPD_ADMISSION_CANCELLED',
      entity: 'IpdAdmission',
      entityId: admissionId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
    });

    return this.formatAdmission(updated);
  }
}
