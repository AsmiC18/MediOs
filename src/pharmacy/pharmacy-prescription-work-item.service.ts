import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PharmacyPrescriptionWorkItemStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDispensingDto } from './dto/create-dispensing.dto';
import { FulfillPrescriptionWorkItemDto } from './dto/fulfill-prescription-work-item.dto';
import { PrescriptionWorkItemQueryDto } from './dto/prescription-work-item-query.dto';
import { PharmacyService } from './pharmacy.service';
import { lockPrescriptionWorkItemRow } from './utils/prescription-work-item-lock.util';
import {
  mapPrescriptionWorkItemDetail,
  mapPrescriptionWorkItemSummary,
  prescriptionWorkItemInclude,
  PrescriptionWorkItemDetailResponse,
  PrescriptionWorkItemListResponse,
  PrescriptionWorkItemSummaryResponse,
  WorkItemWithPrescription,
} from './utils/prescription-work-item-response.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

@Injectable()
export class PharmacyPrescriptionWorkItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pharmacyService: PharmacyService,
  ) {}

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

  private async validatePatientFilter(
    user: AuthenticatedUser,
    patientId: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId: user.hospitalId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    assertBranchAccess(user, patient.branchId);
  }

  private buildListWhere(
    user: AuthenticatedUser,
    query: PrescriptionWorkItemQueryDto,
  ): Prisma.PharmacyPrescriptionWorkItemWhereInput {
    const where: Prisma.PharmacyPrescriptionWorkItemWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.prescriptionId) {
      where.prescriptionId = query.prescriptionId;
    }

    if (user.branchId == null && query.branchId) {
      where.branchId = query.branchId;
    }

    return applyBranchScope(user, where);
  }

  private async findAccessibleWorkItem(
    user: AuthenticatedUser,
    workItemId: string,
  ): Promise<WorkItemWithPrescription> {
    const workItem = await this.prisma.pharmacyPrescriptionWorkItem.findUnique({
      where: { id: workItemId },
      include: prescriptionWorkItemInclude,
    });

    if (!workItem || workItem.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Prescription work item not found');
    }

    assertBranchAccess(user, workItem.branchId);

    return workItem;
  }

  async listWorkItems(
    user: AuthenticatedUser,
    query: PrescriptionWorkItemQueryDto = {},
  ): Promise<PrescriptionWorkItemListResponse> {
    if (query.patientId) {
      await this.validatePatientFilter(user, query.patientId);
    }

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = this.buildListWhere(user, query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.pharmacyPrescriptionWorkItem.count({ where }),
      this.prisma.pharmacyPrescriptionWorkItem.findMany({
        where,
        include: prescriptionWorkItemInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map(mapPrescriptionWorkItemSummary),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getWorkItem(
    user: AuthenticatedUser,
    workItemId: string,
  ): Promise<PrescriptionWorkItemDetailResponse> {
    const workItem = await this.findAccessibleWorkItem(user, workItemId);
    return mapPrescriptionWorkItemDetail(workItem);
  }

  async cancelWorkItem(
    user: AuthenticatedUser,
    workItemId: string,
  ): Promise<PrescriptionWorkItemSummaryResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await lockPrescriptionWorkItemRow(tx, workItemId);

      if (locked.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Prescription work item not found');
      }

      assertBranchAccess(user, locked.branchId);

      if (locked.status === PharmacyPrescriptionWorkItemStatus.CANCELLED) {
        const unchanged = await tx.pharmacyPrescriptionWorkItem.findUniqueOrThrow(
          {
            where: { id: workItemId },
            include: prescriptionWorkItemInclude,
          },
        );
        return { row: unchanged, transitioned: false as const };
      }

      if (locked.status === PharmacyPrescriptionWorkItemStatus.COMPLETED) {
        throw new ConflictException(
          'Completed prescription work items cannot be cancelled',
        );
      }

      if (locked.status !== PharmacyPrescriptionWorkItemStatus.OPEN) {
        throw new ConflictException('Invalid work item status transition');
      }

      const row = await tx.pharmacyPrescriptionWorkItem.update({
        where: { id: workItemId },
        data: {
          status: PharmacyPrescriptionWorkItemStatus.CANCELLED,
          processedAt: new Date(),
        },
        include: prescriptionWorkItemInclude,
      });
      return { row, transitioned: true as const };
    });

    if (updated.transitioned) {
      await this.auditService.log({
        action: 'PHARMACY_PRESCRIPTION_WORK_ITEM_CANCELLED',
        entity: 'PharmacyPrescriptionWorkItem',
        entityId: updated.row.id,
        hospitalId: user.hospitalId,
        branchId: updated.row.branchId,
        userId: user.sub,
        metadata: {
          prescriptionId: updated.row.prescriptionId,
          patientId: updated.row.patientId,
        },
      });
    }

    return mapPrescriptionWorkItemSummary(updated.row);
  }

  async fulfillWorkItem(
    user: AuthenticatedUser,
    workItemId: string,
    body: FulfillPrescriptionWorkItemDto,
  ) {
    const workItem = await this.findAccessibleWorkItem(user, workItemId);

    if (workItem.status === PharmacyPrescriptionWorkItemStatus.COMPLETED) {
      if (!workItem.fulfilledDispensingId) {
        throw new ConflictException('Work item is completed without dispensing');
      }

      const dispensing = await this.pharmacyService.getDispensing(
        user,
        workItem.fulfilledDispensingId,
      );

      return {
        alreadyFulfilled: true as const,
        workItem: mapPrescriptionWorkItemSummary(workItem),
        dispensing,
      };
    }

    if (workItem.status === PharmacyPrescriptionWorkItemStatus.CANCELLED) {
      throw new ConflictException(
        'Cancelled prescription work items cannot be fulfilled',
      );
    }

    if (workItem.status !== PharmacyPrescriptionWorkItemStatus.OPEN) {
      throw new ConflictException('Prescription work item is not open');
    }

    const dispensingDto: CreateDispensingDto = {
      patientId: workItem.patientId,
      prescriptionId: workItem.prescriptionId,
      branchId: body.branchId,
      items: body.items,
    };

    const prepared = await this.pharmacyService.prepareDispensing(
      user,
      dispensingDto,
    );

    const processedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await lockPrescriptionWorkItemRow(tx, workItemId);

      if (locked.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Prescription work item not found');
      }

      assertBranchAccess(user, locked.branchId);

      if (locked.status === PharmacyPrescriptionWorkItemStatus.COMPLETED) {
        if (!locked.fulfilledDispensingId) {
          throw new ConflictException(
            'Work item is completed without dispensing',
          );
        }

        const existingDispensing = await tx.pharmacyDispensing.findUnique({
          where: { id: locked.fulfilledDispensingId },
          include: {
            patient: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
            prescription: {
              select: { id: true, status: true, patientId: true },
            },
            createdBy: {
              select: { id: true, name: true, email: true },
            },
            items: {
              include: {
                product: { select: { id: true, name: true, unit: true } },
                batch: {
                  select: { id: true, batchNumber: true, expiryDate: true },
                },
                prescriptionItem: {
                  select: { id: true, medicationName: true, quantity: true },
                },
              },
            },
          },
        });

        if (!existingDispensing) {
          throw new ConflictException('Fulfilled dispensing record is missing');
        }

        const row = await tx.pharmacyPrescriptionWorkItem.findUniqueOrThrow({
          where: { id: workItemId },
          include: prescriptionWorkItemInclude,
        });

        return {
          alreadyFulfilled: true as const,
          workItem: row,
          dispensing: existingDispensing,
        };
      }

      if (locked.status !== PharmacyPrescriptionWorkItemStatus.OPEN) {
        throw new ConflictException('Prescription work item is not open');
      }

      const dispensing = await this.pharmacyService.createDispensingInTransaction(
        tx,
        user,
        prepared,
      );

      const updatedWorkItem = await tx.pharmacyPrescriptionWorkItem.update({
        where: { id: workItemId },
        data: {
          status: PharmacyPrescriptionWorkItemStatus.COMPLETED,
          fulfilledDispensingId: dispensing.id,
          processedAt,
        },
        include: prescriptionWorkItemInclude,
      });

      return {
        alreadyFulfilled: false as const,
        workItem: updatedWorkItem,
        dispensing,
      };
    });

    if (!result.alreadyFulfilled) {
      await this.pharmacyService.finalizeDispensingAfterCreate(
        user,
        result.dispensing,
      );

      await this.auditService.log({
        action: 'PHARMACY_PRESCRIPTION_WORK_ITEM_COMPLETED',
        entity: 'PharmacyPrescriptionWorkItem',
        entityId: result.workItem.id,
        hospitalId: user.hospitalId,
        branchId: result.workItem.branchId,
        userId: user.sub,
        metadata: {
          prescriptionId: result.workItem.prescriptionId,
          patientId: result.workItem.patientId,
          dispensingId: result.dispensing.id,
        },
      });
    }

    return {
      alreadyFulfilled: result.alreadyFulfilled,
      workItem: mapPrescriptionWorkItemSummary(result.workItem),
      dispensing: result.dispensing,
    };
  }
}
