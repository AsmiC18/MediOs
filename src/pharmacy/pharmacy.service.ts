import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PharmacyDispensingStatus,
  PharmacyStockMovementType,
  PrescriptionStatus,
  Prisma,
} from '@prisma/client';
import { PharmacyDispensingBillingEnqueueService } from '../billing/pharmacy-dispensing-billing-enqueue.service';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
} from './dto/create-batch.dto';
import { CreateDispensingDto, DispensingQueryDto } from './dto/create-dispensing.dto';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/create-product.dto';
import { StockAdjustDto } from './dto/stock-adjust.dto';
import { lockBatchRow, lockBatchesInOrder } from './utils/batch-lock.util';
import {
  allocateFefoBatches,
  assertBatchNotExpired,
  findEligibleBatches,
} from './utils/fefo.util';
import { validateFormularyDispenseLine } from './utils/formulary-dispensing.util';
import { resolveSubstitutionFields } from './utils/substitution.util';

export type PreparedDispensingLine = {
  prescriptionItemId: string;
  productId: string;
  prescribedProductId: string | null;
  substitutionReason: string | null;
  isSubstitution: boolean;
  allocations: { batchId: string; quantity: number; unitPrice: number }[];
};

export type PreparedDispensing = {
  patientId: string;
  prescriptionId: string;
  branchId: string | null;
  resolvedLines: PreparedDispensingLine[];
};

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const STOCK_IN_TYPES: PharmacyStockMovementType[] = [
  PharmacyStockMovementType.PURCHASE,
  PharmacyStockMovementType.ADJUSTMENT_IN,
  PharmacyStockMovementType.RETURN,
];

const STOCK_OUT_TYPES: PharmacyStockMovementType[] = [
  PharmacyStockMovementType.ADJUSTMENT_OUT,
  PharmacyStockMovementType.DISPENSE,
  PharmacyStockMovementType.EXPIRED,
];

const ADJUSTABLE_TYPES: PharmacyStockMovementType[] = [
  PharmacyStockMovementType.PURCHASE,
  PharmacyStockMovementType.ADJUSTMENT_IN,
  PharmacyStockMovementType.ADJUSTMENT_OUT,
  PharmacyStockMovementType.EXPIRED,
];

const dispensingInclude = {
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
      batch: { select: { id: true, batchNumber: true, expiryDate: true } },
      prescriptionItem: {
        select: { id: true, medicationName: true, quantity: true },
      },
    },
  },
} satisfies Prisma.PharmacyDispensingInclude;

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pharmacyDispensingBillingEnqueue?: PharmacyDispensingBillingEnqueueService,
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

    assertBranchAccess(user, patient.branchId);

    return patient;
  }

  private async findOwnedProduct(user: AuthenticatedUser, productId: string) {
    const product = await this.prisma.pharmacyProduct.findUnique({
      where: { id: productId },
    });

    if (!product || product.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pharmacy product not found');
    }

    assertBranchAccess(user, product.branchId);

    return product;
  }

  private async findOwnedBatch(user: AuthenticatedUser, batchId: string) {
    const batch = await this.prisma.pharmacyBatch.findUnique({
      where: { id: batchId },
      include: { product: true },
    });

    if (!batch || batch.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pharmacy batch not found');
    }

    assertBranchAccess(user, batch.branchId);

    return batch;
  }

  private async findOwnedDispensing(user: AuthenticatedUser, dispensingId: string) {
    const dispensing = await this.prisma.pharmacyDispensing.findUnique({
      where: { id: dispensingId },
      include: dispensingInclude,
    });

    if (!dispensing || dispensing.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pharmacy dispensing not found');
    }

    assertBranchAccess(user, dispensing.branchId);

    return dispensing;
  }

  private async getDispensedQuantityForItem(prescriptionItemId: string): Promise<number> {
    const aggregate = await this.prisma.pharmacyDispensingItem.aggregate({
      where: {
        prescriptionItemId,
        dispensing: {
          status: { not: PharmacyDispensingStatus.CANCELLED },
        },
      },
      _sum: { quantity: true },
    });

    return aggregate._sum.quantity ?? 0;
  }

  private async recordStockMovement(
    tx: Prisma.TransactionClient,
    input: {
      hospitalId: string;
      branchId?: string | null;
      productId: string;
      batchId: string;
      movementType: PharmacyStockMovementType;
      quantity: number;
      referenceType?: string;
      referenceId?: string;
      reason?: string;
      createdByUserId: string;
    },
  ) {
    return tx.pharmacyStockMovement.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        productId: input.productId,
        batchId: input.batchId,
        movementType: input.movementType,
        quantity: input.quantity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  async createProduct(user: AuthenticatedUser, dto: CreateProductDto) {
    const branchId = resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    let product;

    try {
      product = await this.prisma.pharmacyProduct.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: branchId ?? null,
          name: dto.name.trim(),
          genericName: dto.genericName?.trim(),
          strength: dto.strength?.trim(),
          dosageForm: dto.dosageForm?.trim(),
          unit: dto.unit.trim(),
          sku: dto.sku?.trim() || null,
          reorderLevel: dto.reorderLevel ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product with this SKU already exists');
      }

      throw error;
    }

    await this.auditService.log({
      action: 'PHARMACY_PRODUCT_CREATED',
      entity: 'PharmacyProduct',
      entityId: product.id,
      hospitalId: user.hospitalId,
      branchId: product.branchId,
      userId: user.sub,
      metadata: { name: product.name, sku: product.sku },
    });

    return product;
  }

  async listProducts(user: AuthenticatedUser, query: ProductQueryDto) {
    const where: Prisma.PharmacyProductWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.pharmacyProduct.findMany({
      where: applyBranchScope(user, where),
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(user: AuthenticatedUser, productId: string) {
    return this.findOwnedProduct(user, productId);
  }

  async updateProduct(
    user: AuthenticatedUser,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const existing = await this.findOwnedProduct(user, productId);

    const product = await this.prisma.pharmacyProduct.update({
      where: { id: existing.id },
      data: {
        name: dto.name?.trim(),
        genericName: dto.genericName?.trim(),
        strength: dto.strength?.trim(),
        dosageForm: dto.dosageForm?.trim(),
        unit: dto.unit?.trim(),
        sku: dto.sku !== undefined ? dto.sku?.trim() || null : undefined,
        reorderLevel: dto.reorderLevel,
        isActive: dto.isActive,
      },
    });

    await this.auditService.log({
      action: dto.isActive === false
        ? 'PHARMACY_PRODUCT_DEACTIVATED'
        : 'PHARMACY_PRODUCT_UPDATED',
      entity: 'PharmacyProduct',
      entityId: product.id,
      hospitalId: user.hospitalId,
      branchId: product.branchId,
      userId: user.sub,
      metadata: { isActive: product.isActive },
    });

    return product;
  }

  async deleteProduct(user: AuthenticatedUser, productId: string) {
    const existing = await this.findOwnedProduct(user, productId);

    const product = await this.prisma.pharmacyProduct.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    await this.auditService.log({
      action: 'PHARMACY_PRODUCT_DEACTIVATED',
      entity: 'PharmacyProduct',
      entityId: product.id,
      hospitalId: user.hospitalId,
      branchId: product.branchId,
      userId: user.sub,
      metadata: { name: product.name },
    });

    return product;
  }

  async createBatch(user: AuthenticatedUser, dto: CreateBatchDto) {
    const product = await this.findOwnedProduct(user, dto.productId);

    if (!product.isActive) {
      throw new BadRequestException('Cannot add batch to inactive product');
    }

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const expiryDate = new Date(dto.expiryDate);

    let batch;

    try {
      batch = await this.prisma.$transaction(async (tx) => {
        const created = await tx.pharmacyBatch.create({
          data: {
            hospitalId: user.hospitalId,
            branchId: dto.branchId ?? product.branchId,
            productId: product.id,
            batchNumber: dto.batchNumber.trim(),
            expiryDate,
            unitCost: dto.unitCost,
            sellingPrice: dto.sellingPrice,
            quantity: dto.quantity,
          },
        });

        if (dto.quantity > 0) {
          await this.recordStockMovement(tx, {
            hospitalId: user.hospitalId,
            branchId: created.branchId,
            productId: product.id,
            batchId: created.id,
            movementType: PharmacyStockMovementType.PURCHASE,
            quantity: dto.quantity,
            referenceType: 'PharmacyBatch',
            referenceId: created.id,
            reason: 'Initial batch stock',
            createdByUserId: user.sub,
          });
        }

        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Batch number already exists for this product');
      }

      throw error;
    }

    await this.auditService.log({
      action: 'PHARMACY_BATCH_CREATED',
      entity: 'PharmacyBatch',
      entityId: batch.id,
      hospitalId: user.hospitalId,
      branchId: batch.branchId,
      userId: user.sub,
      metadata: {
        productId: batch.productId,
        batchNumber: batch.batchNumber,
        quantity: batch.quantity,
      },
    });

    return batch;
  }

  async listBatches(user: AuthenticatedUser, query: BatchQueryDto) {
    const where: Prisma.PharmacyBatchWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.productId) {
      await this.findOwnedProduct(user, query.productId);
      where.productId = query.productId;
    }

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    return this.prisma.pharmacyBatch.findMany({
      where: applyBranchScope(user, where),
      include: { product: { select: { id: true, name: true, unit: true, isActive: true } } },
      orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
    });
  }

  async getBatch(user: AuthenticatedUser, batchId: string) {
    const batch = await this.findOwnedBatch(user, batchId);
    return batch;
  }

  async updateBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: UpdateBatchDto,
  ) {
    const existing = await this.findOwnedBatch(user, batchId);

    return this.prisma.pharmacyBatch.update({
      where: { id: existing.id },
      data: {
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        unitCost: dto.unitCost,
        sellingPrice: dto.sellingPrice,
      },
    });
  }

  async adjustStock(user: AuthenticatedUser, dto: StockAdjustDto) {
    if (!ADJUSTABLE_TYPES.includes(dto.movementType)) {
      throw new BadRequestException(
        'Use dispensing or cancellation flows for DISPENSE/RETURN movements',
      );
    }

    const batch = await this.findOwnedBatch(user, dto.batchId);

    if (!batch.product.isActive) {
      throw new BadRequestException('Product is inactive');
    }

    assertBatchNotExpired(batch);

    const isStockIn = STOCK_IN_TYPES.includes(dto.movementType);
    const isStockOut = STOCK_OUT_TYPES.includes(dto.movementType);

    if (!isStockIn && !isStockOut) {
      throw new BadRequestException('Invalid stock movement type');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await lockBatchRow(tx, batch.id);

      if (isStockOut && locked.quantity < dto.quantity) {
        throw new ConflictException('Insufficient stock');
      }

      const nextQuantity = isStockIn
        ? locked.quantity + dto.quantity
        : locked.quantity - dto.quantity;

      if (nextQuantity < 0) {
        throw new ConflictException('Insufficient stock');
      }

      const updatedBatch = await tx.pharmacyBatch.update({
        where: { id: locked.id },
        data: { quantity: nextQuantity },
      });

      await this.recordStockMovement(tx, {
        hospitalId: user.hospitalId,
        branchId: locked.branchId,
        productId: locked.productId,
        batchId: locked.id,
        movementType: dto.movementType,
        quantity: dto.quantity,
        referenceType: 'PharmacyBatch',
        referenceId: locked.id,
        reason: dto.reason,
        createdByUserId: user.sub,
      });

      return updatedBatch;
    });

    await this.auditService.log({
      action: 'PHARMACY_STOCK_ADJUSTED',
      entity: 'PharmacyBatch',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        movementType: dto.movementType,
        quantity: dto.quantity,
        resultingQuantity: updated.quantity,
      },
    });

    return updated;
  }

  async prepareDispensing(
    user: AuthenticatedUser,
    dto: CreateDispensingDto,
  ): Promise<PreparedDispensing> {
    await this.validatePatient(user, dto.patientId);

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: dto.prescriptionId },
      include: { items: true, encounter: true },
    });

    if (!prescription || prescription.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.patientId !== dto.patientId) {
      throw new BadRequestException(
        'Prescription does not belong to the specified patient',
      );
    }

    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot dispense from a cancelled prescription',
      );
    }

    assertBranchAccess(user, prescription.encounter.branchId);

    let branchId =
      dto.branchId ?? prescription.encounter.branchId ?? user.branchId ?? null;
    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
      branchId = dto.branchId;
    }

    const resolvedLines: PreparedDispensingLine[] = [];

    for (const item of dto.items) {
      const prescriptionItem = prescription.items.find(
        (pi) => pi.id === item.prescriptionItemId,
      );

      if (!prescriptionItem) {
        throw new BadRequestException(
          'Prescription item does not belong to the prescription',
        );
      }

      if (prescriptionItem.quantity == null) {
        throw new BadRequestException(
          'Prescription item quantity is required before dispensing',
        );
      }

      const alreadyDispensed = await this.getDispensedQuantityForItem(
        item.prescriptionItemId,
      );
      if (alreadyDispensed + item.quantity > prescriptionItem.quantity) {
        throw new BadRequestException(
          'Dispensed quantity would exceed prescribed quantity',
        );
      }

      const substitution = resolveSubstitutionFields({
        productId: item.productId,
        prescribedProductId: item.prescribedProductId,
        substitutionReason: item.substitutionReason,
      });

      if (prescriptionItem.clinicalDrugId) {
        const formularyEntry =
          await this.prisma.hospitalFormularyEntry.findUnique({
            where: {
              hospitalId_clinicalDrugId: {
                hospitalId: user.hospitalId,
                clinicalDrugId: prescriptionItem.clinicalDrugId,
              },
            },
          });
        validateFormularyDispenseLine({
          formularyEntryActive: formularyEntry?.isActive ?? false,
          defaultPharmacyProductId:
            formularyEntry?.defaultPharmacyProductId ?? null,
          dispensedProductId: item.productId,
          prescribedProductId: substitution.prescribedProductId,
          substitutionReason: substitution.substitutionReason,
          isSubstitution: substitution.isSubstitution,
        });
      }

      if (substitution.isSubstitution && substitution.prescribedProductId) {
        const prescribedProduct = await this.findOwnedProduct(
          user,
          substitution.prescribedProductId,
        );
        if (!prescribedProduct.isActive) {
          throw new BadRequestException('Prescribed product is inactive');
        }
      }

      const product = await this.findOwnedProduct(user, item.productId);
      if (!product.isActive) {
        throw new BadRequestException('Product is inactive');
      }

      const lineBase = {
        prescriptionItemId: item.prescriptionItemId,
        productId: product.id,
        prescribedProductId: substitution.prescribedProductId,
        substitutionReason: substitution.substitutionReason,
        isSubstitution: substitution.isSubstitution,
      };

      if (item.batchId) {
        const batch = await this.findOwnedBatch(user, item.batchId);
        if (batch.productId !== product.id) {
          throw new BadRequestException(
            'Batch does not belong to the specified product',
          );
        }
        assertBatchNotExpired(batch);
        if (batch.quantity < item.quantity) {
          throw new ConflictException('Insufficient stock in selected batch');
        }
        resolvedLines.push({
          ...lineBase,
          allocations: [
            {
              batchId: batch.id,
              quantity: item.quantity,
              unitPrice: batch.sellingPrice ? Number(batch.sellingPrice) : 0,
            },
          ],
        });
      } else {
        const eligible = await findEligibleBatches(this.prisma, {
          hospitalId: user.hospitalId,
          productId: product.id,
          branchId,
        });
        const allocations = allocateFefoBatches(eligible, item.quantity);
        resolvedLines.push({
          ...lineBase,
          allocations,
        });
      }
    }

    return {
      patientId: dto.patientId,
      prescriptionId: dto.prescriptionId,
      branchId,
      resolvedLines,
    };
  }

  async createDispensingInTransaction(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    prepared: PreparedDispensing,
  ) {
    const { branchId, resolvedLines, patientId, prescriptionId } = prepared;

    const allBatchIds = resolvedLines.flatMap((line) =>
      line.allocations.map((a) => a.batchId),
    );

    await lockBatchesInOrder(tx, allBatchIds);

    for (const line of resolvedLines) {
      for (const allocation of line.allocations) {
        const locked = await tx.pharmacyBatch.findUniqueOrThrow({
          where: { id: allocation.batchId },
          include: { product: true },
        });

        if (!locked.product.isActive) {
          throw new BadRequestException('Product is inactive');
        }

        assertBatchNotExpired(locked);

        if (locked.quantity < allocation.quantity) {
          throw new ConflictException('Insufficient stock');
        }

        await tx.pharmacyBatch.update({
          where: { id: locked.id },
          data: { quantity: locked.quantity - allocation.quantity },
        });
      }
    }

    const created = await tx.pharmacyDispensing.create({
      data: {
        hospitalId: user.hospitalId,
        branchId,
        patientId,
        prescriptionId,
        createdByUserId: user.sub,
        status: PharmacyDispensingStatus.DISPENSED,
        dispensedAt: new Date(),
        items: {
          create: resolvedLines.flatMap((line) =>
            line.allocations.map((allocation) => ({
              prescriptionItemId: line.prescriptionItemId,
              productId: line.productId,
              prescribedProductId: line.prescribedProductId,
              substitutionReason: line.substitutionReason,
              substitutedByUserId: line.isSubstitution ? user.sub : null,
              substitutedAt: line.isSubstitution ? new Date() : null,
              batchId: allocation.batchId,
              quantity: allocation.quantity,
              unitPrice: allocation.unitPrice,
            })),
          ),
        },
      },
      include: dispensingInclude,
    });

    for (const line of resolvedLines) {
      for (const allocation of line.allocations) {
        await this.recordStockMovement(tx, {
          hospitalId: user.hospitalId,
          branchId,
          productId: line.productId,
          batchId: allocation.batchId,
          movementType: PharmacyStockMovementType.DISPENSE,
          quantity: allocation.quantity,
          referenceType: 'PharmacyDispensing',
          referenceId: created.id,
          createdByUserId: user.sub,
        });
      }
    }

    return created;
  }

  async finalizeDispensingAfterCreate(
    user: AuthenticatedUser,
    dispensing: Prisma.PharmacyDispensingGetPayload<{
      include: typeof dispensingInclude;
    }>,
  ) {
    await this.auditService.log({
      action: 'PHARMACY_DISPENSING_CREATED',
      entity: 'PharmacyDispensing',
      entityId: dispensing.id,
      hospitalId: user.hospitalId,
      branchId: dispensing.branchId,
      userId: user.sub,
      metadata: {
        prescriptionId: dispensing.prescriptionId,
        patientId: dispensing.patientId,
        itemCount: dispensing.items.length,
      },
    });

    for (const dispensedItem of dispensing.items) {
      if (dispensedItem.prescribedProductId) {
        await this.auditService.log({
          action: 'PHARMACY_DISPENSE_SUBSTITUTION',
          entity: 'PharmacyDispensingItem',
          entityId: dispensedItem.id,
          hospitalId: user.hospitalId,
          branchId: dispensing.branchId,
          userId: user.sub,
          metadata: {
            dispensingId: dispensing.id,
            prescriptionItemId: dispensedItem.prescriptionItemId,
            patientId: dispensing.patientId,
            prescribedProductId: dispensedItem.prescribedProductId,
            dispensedProductId: dispensedItem.productId,
            reason: dispensedItem.substitutionReason,
          },
        });
      }
    }

    if (this.pharmacyDispensingBillingEnqueue) {
      await this.pharmacyDispensingBillingEnqueue.enqueueForDispensing({
        id: dispensing.id,
        hospitalId: dispensing.hospitalId,
        branchId: dispensing.branchId,
        patientId: dispensing.patientId,
      });
    }

    await this.onDispensingCompleted(dispensing);

    const totalAmount = this.summarizeDispensingAmount(dispensing.items);
    await this.auditService.log({
      action: 'PHARMACY_DISPENSING_COMPLETED',
      entity: 'PharmacyDispensing',
      entityId: dispensing.id,
      hospitalId: user.hospitalId,
      branchId: dispensing.branchId,
      userId: user.sub,
      metadata: {
        patientId: dispensing.patientId,
        dispensingId: dispensing.id,
        itemCount: dispensing.items.length,
        totalAmount,
      },
    });

    return dispensing;
  }

  async createDispensing(user: AuthenticatedUser, dto: CreateDispensingDto) {
    const prepared = await this.prepareDispensing(user, dto);

    const dispensing = await this.prisma.$transaction(async (tx) =>
      this.createDispensingInTransaction(tx, user, prepared),
    );

    return this.finalizeDispensingAfterCreate(user, dispensing);
  }

  private summarizeDispensingAmount(
    items: Array<{ quantity: number; unitPrice: Prisma.Decimal | null }>,
  ): string {
    const total = items.reduce((sum, item) => {
      const unit = item.unitPrice ? item.unitPrice.toNumber() : 0;
      return sum + unit * item.quantity;
    }, 0);
    return total.toFixed(2);
  }

  /**
   * Integration hook for future pharmacy → billing workflows.
   * No invoice is created automatically today.
   */
  private async onDispensingCompleted(
    dispensing: Prisma.PharmacyDispensingGetPayload<{ include: typeof dispensingInclude }>,
  ): Promise<void> {
    void dispensing;
  }

  async listDispensings(user: AuthenticatedUser, query: DispensingQueryDto) {
    const where: Prisma.PharmacyDispensingWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }

    if (query.prescriptionId) {
      where.prescriptionId = query.prescriptionId;
    }

    return this.prisma.pharmacyDispensing.findMany({
      where: applyBranchScope(user, where),
      include: dispensingInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDispensing(user: AuthenticatedUser, dispensingId: string) {
    return this.findOwnedDispensing(user, dispensingId);
  }

  async cancelDispensing(user: AuthenticatedUser, dispensingId: string) {
    const dispensing = await this.findOwnedDispensing(user, dispensingId);

    if (dispensing.status !== PharmacyDispensingStatus.DISPENSED) {
      throw new BadRequestException('Only dispensed records can be cancelled');
    }

    const batchIds = dispensing.items.map((item) => item.batchId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockBatchesInOrder(tx, batchIds);

      for (const item of dispensing.items) {
        const locked = await lockBatchRow(tx, item.batchId);

        await tx.pharmacyBatch.update({
          where: { id: locked.id },
          data: { quantity: locked.quantity + item.quantity },
        });

        await this.recordStockMovement(tx, {
          hospitalId: user.hospitalId,
          branchId: dispensing.branchId,
          productId: item.productId,
          batchId: item.batchId,
          movementType: PharmacyStockMovementType.RETURN,
          quantity: item.quantity,
          referenceType: 'PharmacyDispensing',
          referenceId: dispensing.id,
          reason: 'Dispensing cancelled',
          createdByUserId: user.sub,
        });
      }

      return tx.pharmacyDispensing.update({
        where: { id: dispensing.id },
        data: { status: PharmacyDispensingStatus.CANCELLED },
        include: dispensingInclude,
      });
    });

    await this.auditService.log({
      action: 'PHARMACY_DISPENSING_CANCELLED',
      entity: 'PharmacyDispensing',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        prescriptionId: updated.prescriptionId,
        itemCount: updated.items.length,
      },
    });

    return updated;
  }
}
