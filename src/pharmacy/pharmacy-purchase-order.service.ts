import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PharmacyPurchaseOrderStatus,
  PharmacyStockMovementType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  ReceiveStockDto,
  UpdateDraftPurchaseOrderDto,
} from './dto/purchase-order.dto';
import { lockBatchRow } from './utils/batch-lock.util';
import { startOfUtcDay } from './utils/fefo.util';
import { generatePurchaseOrderNumber } from './utils/po-number.util';
import {
  assertPurchaseOrderTransition,
  isPurchaseOrderCancellable,
  isPurchaseOrderDraftEditable,
  isPurchaseOrderReceivable,
} from './utils/po-transitions.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const poInclude = {
  supplier: {
    select: { id: true, name: true, code: true, isActive: true },
  },
  items: {
    include: {
      product: {
        select: { id: true, name: true, unit: true, sku: true, isActive: true },
      },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PharmacyPurchaseOrderInclude;

const receiptInclude = {
  lines: {
    include: {
      batch: {
        select: {
          id: true,
          batchNumber: true,
          expiryDate: true,
          quantity: true,
        },
      },
      purchaseOrderItem: {
        select: { id: true, productId: true, orderedQuantity: true },
      },
    },
  },
  purchaseOrder: { select: { id: true, poNumber: true, status: true } },
} satisfies Prisma.PharmacyPurchaseOrderReceiptInclude;

type PoPayload = Prisma.PharmacyPurchaseOrderGetPayload<{
  include: typeof poInclude;
}>;

@Injectable()
export class PharmacyPurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

  private resolveCreateBranchId(
    user: AuthenticatedUser,
    dtoBranchId?: string | null,
  ): string | null {
    if (user.branchId != null) {
      return user.branchId;
    }
    if (dtoBranchId) {
      return dtoBranchId;
    }
    return null;
  }

  private async findOwnedSupplier(user: AuthenticatedUser, supplierId: string) {
    const supplier = await this.prisma.pharmacySupplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pharmacy supplier not found');
    }

    return supplier;
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

  private async findOwnedPurchaseOrder(
    user: AuthenticatedUser,
    purchaseOrderId: string,
  ): Promise<PoPayload> {
    const po = await this.prisma.pharmacyPurchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: poInclude,
    });

    if (!po || po.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Purchase order not found');
    }

    assertBranchAccess(user, po.branchId);

    return po;
  }

  private formatItem(
    item: PoPayload['items'][number],
  ) {
    return {
      id: item.id,
      productId: item.productId,
      orderedQuantity: item.orderedQuantity,
      receivedQuantity: item.receivedQuantity,
      remainingQuantity: item.orderedQuantity - item.receivedQuantity,
      unitCost: item.unitCost,
      product: item.product,
    };
  }

  private formatPurchaseOrder(po: PoPayload) {
    return {
      id: po.id,
      hospitalId: po.hospitalId,
      branchId: po.branchId,
      supplierId: po.supplierId,
      poNumber: po.poNumber,
      status: po.status,
      notes: po.notes,
      submittedAt: po.submittedAt,
      approvedAt: po.approvedAt,
      cancelledAt: po.cancelledAt,
      cancelReason: po.cancelReason,
      fullyReceivedAt: po.fullyReceivedAt,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      supplier: po.supplier,
      createdBy: po.createdBy,
      approvedBy: po.approvedBy,
      items: po.items.map((item) => this.formatItem(item)),
    };
  }

  private assertDistinctProducts(
    items: { productId: string }[],
  ): void {
    const ids = items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate products on purchase order');
    }
  }

  private async validatePoLineProducts(
    user: AuthenticatedUser,
    items: { productId: string; orderedQuantity: number }[],
    branchId: string | null,
  ): Promise<void> {
    this.assertDistinctProducts(items);

    for (const item of items) {
      if (item.orderedQuantity < 1) {
        throw new BadRequestException('Ordered quantity must be at least 1');
      }

      const product = await this.findOwnedProduct(user, item.productId);

      if (!product.isActive) {
        throw new BadRequestException(`Product ${product.name} is inactive`);
      }

      if (
        branchId != null &&
        product.branchId != null &&
        product.branchId !== branchId
      ) {
        throw new BadRequestException(
          'Product branch does not match purchase order branch',
        );
      }
    }
  }

  private async recordStockMovement(
    tx: Prisma.TransactionClient,
    input: {
      hospitalId: string;
      branchId?: string | null;
      productId: string;
      batchId: string;
      quantity: number;
      referenceId: string;
      createdByUserId: string;
    },
  ) {
    return tx.pharmacyStockMovement.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        productId: input.productId,
        batchId: input.batchId,
        movementType: PharmacyStockMovementType.PURCHASE,
        quantity: input.quantity,
        referenceType: 'PharmacyPurchaseOrderReceipt',
        referenceId: input.referenceId,
        reason: 'Purchase order stock receipt',
        createdByUserId: input.createdByUserId,
      },
    });
  }

  private sameUtcDay(a: Date, b: Date): boolean {
    return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
  }

  async createPurchaseOrder(user: AuthenticatedUser, dto: CreatePurchaseOrderDto) {
    const supplier = await this.findOwnedSupplier(user, dto.supplierId);

    if (!supplier.isActive) {
      throw new BadRequestException('Supplier is inactive');
    }

    const branchId = this.resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    await this.validatePoLineProducts(user, dto.items, branchId);

    const po = await this.prisma.$transaction(async (tx) => {
      const poNumber = await generatePurchaseOrderNumber(tx, user.hospitalId);

      return tx.pharmacyPurchaseOrder.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          supplierId: supplier.id,
          poNumber,
          status: PharmacyPurchaseOrderStatus.DRAFT,
          notes: dto.notes?.trim(),
          createdByUserId: user.sub,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              orderedQuantity: item.orderedQuantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: poInclude,
      });
    });

    await this.auditService.log({
      action: 'PHARMACY_PO_CREATED',
      entity: 'PharmacyPurchaseOrder',
      entityId: po.id,
      hospitalId: user.hospitalId,
      branchId: po.branchId,
      userId: user.sub,
      metadata: { poNumber: po.poNumber, supplierId: po.supplierId },
    });

    return this.formatPurchaseOrder(po);
  }

  async listPurchaseOrders(user: AuthenticatedUser, query: PurchaseOrderQueryDto) {
    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const whereInput: Prisma.PharmacyPurchaseOrderWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.supplierId) {
      await this.findOwnedSupplier(user, query.supplierId);
      whereInput.supplierId = query.supplierId;
    }

    if (query.status) {
      whereInput.status = query.status;
    }

    if (user.branchId == null && query.branchId) {
      whereInput.branchId = query.branchId;
    }

    const where = applyBranchScope(user, whereInput);

    const orders = await this.prisma.pharmacyPurchaseOrder.findMany({
      where,
      include: poInclude,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((po) => this.formatPurchaseOrder(po));
  }

  async getPurchaseOrder(user: AuthenticatedUser, purchaseOrderId: string) {
    const po = await this.findOwnedPurchaseOrder(user, purchaseOrderId);
    return this.formatPurchaseOrder(po);
  }

  async updateDraftPurchaseOrder(
    user: AuthenticatedUser,
    purchaseOrderId: string,
    dto: UpdateDraftPurchaseOrderDto,
  ) {
    const existing = await this.findOwnedPurchaseOrder(user, purchaseOrderId);

    if (!isPurchaseOrderDraftEditable(existing.status)) {
      throw new BadRequestException('Only draft purchase orders can be updated');
    }

    if (dto.items) {
      await this.validatePoLineProducts(user, dto.items, existing.branchId);
    }

    const po = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.pharmacyPurchaseOrderItem.deleteMany({
          where: { purchaseOrderId: existing.id },
        });
      }

      return tx.pharmacyPurchaseOrder.update({
        where: { id: existing.id },
        data: {
          notes: dto.notes !== undefined ? dto.notes?.trim() : undefined,
          items: dto.items
            ? {
                create: dto.items.map((item) => ({
                  productId: item.productId,
                  orderedQuantity: item.orderedQuantity,
                  unitCost: item.unitCost,
                })),
              }
            : undefined,
        },
        include: poInclude,
      });
    });

    await this.auditService.log({
      action: 'PHARMACY_PO_UPDATED',
      entity: 'PharmacyPurchaseOrder',
      entityId: po.id,
      hospitalId: user.hospitalId,
      branchId: po.branchId,
      userId: user.sub,
      metadata: { poNumber: po.poNumber },
    });

    return this.formatPurchaseOrder(po);
  }

  async submitPurchaseOrder(user: AuthenticatedUser, purchaseOrderId: string) {
    const existing = await this.findOwnedPurchaseOrder(user, purchaseOrderId);

    if (existing.items.length === 0) {
      throw new BadRequestException('Purchase order must have at least one item');
    }

    assertPurchaseOrderTransition(
      existing.status,
      PharmacyPurchaseOrderStatus.SUBMITTED,
    );

    const po = await this.prisma.pharmacyPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: PharmacyPurchaseOrderStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: poInclude,
    });

    await this.auditService.log({
      action: 'PHARMACY_PO_SUBMITTED',
      entity: 'PharmacyPurchaseOrder',
      entityId: po.id,
      hospitalId: user.hospitalId,
      branchId: po.branchId,
      userId: user.sub,
      metadata: { poNumber: po.poNumber },
    });

    return this.formatPurchaseOrder(po);
  }

  async approvePurchaseOrder(user: AuthenticatedUser, purchaseOrderId: string) {
    const existing = await this.findOwnedPurchaseOrder(user, purchaseOrderId);

    assertPurchaseOrderTransition(
      existing.status,
      PharmacyPurchaseOrderStatus.APPROVED,
    );

    const po = await this.prisma.pharmacyPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: PharmacyPurchaseOrderStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: user.sub,
      },
      include: poInclude,
    });

    await this.auditService.log({
      action: 'PHARMACY_PO_APPROVED',
      entity: 'PharmacyPurchaseOrder',
      entityId: po.id,
      hospitalId: user.hospitalId,
      branchId: po.branchId,
      userId: user.sub,
      metadata: { poNumber: po.poNumber },
    });

    return this.formatPurchaseOrder(po);
  }

  async cancelPurchaseOrder(
    user: AuthenticatedUser,
    purchaseOrderId: string,
    dto: CancelPurchaseOrderDto,
  ) {
    const existing = await this.findOwnedPurchaseOrder(user, purchaseOrderId);

    if (!isPurchaseOrderCancellable(existing.status)) {
      throw new BadRequestException('Purchase order cannot be cancelled');
    }

    if (existing.items.some((item) => item.receivedQuantity > 0)) {
      throw new BadRequestException(
        'Cannot cancel a purchase order after stock has been received',
      );
    }

    assertPurchaseOrderTransition(
      existing.status,
      PharmacyPurchaseOrderStatus.CANCELLED,
    );

    const po = await this.prisma.pharmacyPurchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: PharmacyPurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason?.trim(),
      },
      include: poInclude,
    });

    await this.auditService.log({
      action: 'PHARMACY_PO_CANCELLED',
      entity: 'PharmacyPurchaseOrder',
      entityId: po.id,
      hospitalId: user.hospitalId,
      branchId: po.branchId,
      userId: user.sub,
      metadata: { poNumber: po.poNumber },
    });

    return this.formatPurchaseOrder(po);
  }

  async receiveStock(
    user: AuthenticatedUser,
    purchaseOrderId: string,
    dto: ReceiveStockDto,
  ) {
    const idempotencyKey = dto.idempotencyKey.trim();

    const existingReceipt = await this.prisma.pharmacyPurchaseOrderReceipt.findUnique(
      {
        where: {
          hospitalId_idempotencyKey: {
            hospitalId: user.hospitalId,
            idempotencyKey,
          },
        },
        include: receiptInclude,
      },
    );

    if (existingReceipt) {
      if (existingReceipt.purchaseOrderId !== purchaseOrderId) {
        throw new ConflictException('Idempotency key already used for another receipt');
      }
      return existingReceipt;
    }

    const po = await this.findOwnedPurchaseOrder(user, purchaseOrderId);

    if (!isPurchaseOrderReceivable(po.status)) {
      throw new BadRequestException(
        'Stock can only be received for approved purchase orders',
      );
    }

    if (dto.lines.length === 0) {
      throw new BadRequestException('At least one receipt line is required');
    }

    const lineItemIds = dto.lines.map((l) => l.purchaseOrderItemId);
    if (new Set(lineItemIds).size !== lineItemIds.length) {
      throw new BadRequestException('Duplicate purchase order items in receipt');
    }

    for (const line of dto.lines) {
      if (line.quantity < 1) {
        throw new BadRequestException('Received quantity must be at least 1');
      }

      const poItem = po.items.find((i) => i.id === line.purchaseOrderItemId);

      if (!poItem) {
        throw new BadRequestException('Purchase order item not found on this PO');
      }

      const remaining = poItem.orderedQuantity - poItem.receivedQuantity;

      if (line.quantity > remaining) {
        throw new BadRequestException(
          'Received quantity exceeds remaining ordered quantity',
        );
      }

      const expiryDate = new Date(line.expiryDate);
      if (Number.isNaN(expiryDate.getTime())) {
        throw new BadRequestException('Invalid expiry date');
      }
    }

    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pharmacy-po:' + purchaseOrderId}))`;

        const lockedPo = await tx.pharmacyPurchaseOrder.findUniqueOrThrow({
          where: { id: purchaseOrderId },
          include: { items: true },
        });

        if (!isPurchaseOrderReceivable(lockedPo.status)) {
          throw new BadRequestException(
            'Stock can only be received for approved purchase orders',
          );
        }

        if (lockedPo.hospitalId !== user.hospitalId) {
          throw new NotFoundException('Purchase order not found');
        }

        const createdReceipt = await tx.pharmacyPurchaseOrderReceipt.create({
          data: {
            hospitalId: user.hospitalId,
            branchId: lockedPo.branchId,
            purchaseOrderId: lockedPo.id,
            idempotencyKey,
            receivedByUserId: user.sub,
            notes: dto.notes?.trim(),
          },
        });

        for (const line of dto.lines) {
          const poItem = lockedPo.items.find(
            (i) => i.id === line.purchaseOrderItemId,
          );

          if (!poItem) {
            throw new BadRequestException('Purchase order item not found');
          }

          const remaining = poItem.orderedQuantity - poItem.receivedQuantity;

          if (line.quantity > remaining) {
            throw new BadRequestException(
              'Received quantity exceeds remaining ordered quantity',
            );
          }

          const product = await tx.pharmacyProduct.findUniqueOrThrow({
            where: { id: poItem.productId },
          });

          if (!product.isActive) {
            throw new BadRequestException('Product is inactive');
          }

          const expiryDate = new Date(line.expiryDate);
          const batchNumber = line.batchNumber.trim();
          const unitCost = line.unitCost ?? poItem.unitCost;

          let batch = await tx.pharmacyBatch.findUnique({
            where: {
              hospitalId_productId_batchNumber: {
                hospitalId: user.hospitalId,
                productId: product.id,
                batchNumber,
              },
            },
          });

          if (batch) {
            if (!this.sameUtcDay(batch.expiryDate, expiryDate)) {
              throw new BadRequestException(
                'Existing batch has a different expiry date',
              );
            }

            if (
              lockedPo.branchId != null &&
              batch.branchId != null &&
              batch.branchId !== lockedPo.branchId
            ) {
              throw new BadRequestException(
                'Existing batch belongs to a different branch',
              );
            }

            batch = await lockBatchRow(tx, batch.id);
            batch = await tx.pharmacyBatch.update({
              where: { id: batch.id },
              data: {
                quantity: batch.quantity + line.quantity,
                unitCost: unitCost ?? batch.unitCost,
              },
            });
          } else {
            try {
              batch = await tx.pharmacyBatch.create({
                data: {
                  hospitalId: user.hospitalId,
                  branchId: lockedPo.branchId,
                  productId: product.id,
                  batchNumber,
                  expiryDate,
                  unitCost,
                  quantity: line.quantity,
                },
              });
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
              ) {
                batch = await tx.pharmacyBatch.findUniqueOrThrow({
                  where: {
                    hospitalId_productId_batchNumber: {
                      hospitalId: user.hospitalId,
                      productId: product.id,
                      batchNumber,
                    },
                  },
                });
                batch = await lockBatchRow(tx, batch.id);
                batch = await tx.pharmacyBatch.update({
                  where: { id: batch.id },
                  data: { quantity: batch.quantity + line.quantity },
                });
              } else {
                throw error;
              }
            }
          }

          await this.recordStockMovement(tx, {
            hospitalId: user.hospitalId,
            branchId: lockedPo.branchId,
            productId: product.id,
            batchId: batch.id,
            quantity: line.quantity,
            referenceId: createdReceipt.id,
            createdByUserId: user.sub,
          });

          await tx.pharmacyPurchaseOrderReceiptLine.create({
            data: {
              receiptId: createdReceipt.id,
              purchaseOrderItemId: poItem.id,
              batchId: batch.id,
              batchNumber,
              expiryDate,
              quantityReceived: line.quantity,
              unitCost,
            },
          });

          await tx.pharmacyPurchaseOrderItem.update({
            where: { id: poItem.id },
            data: {
              receivedQuantity: poItem.receivedQuantity + line.quantity,
            },
          });

          poItem.receivedQuantity += line.quantity;
        }

        const refreshedItems = await tx.pharmacyPurchaseOrderItem.findMany({
          where: { purchaseOrderId: lockedPo.id },
        });

        const allReceived = refreshedItems.every(
          (item) => item.receivedQuantity >= item.orderedQuantity,
        );
        const anyReceived = refreshedItems.some(
          (item) => item.receivedQuantity > 0,
        );

        let nextStatus = lockedPo.status;

        if (allReceived) {
          nextStatus = PharmacyPurchaseOrderStatus.RECEIVED;
        } else if (anyReceived) {
          nextStatus = PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED;
        }

        if (nextStatus !== lockedPo.status) {
          assertPurchaseOrderTransition(lockedPo.status, nextStatus);
          await tx.pharmacyPurchaseOrder.update({
            where: { id: lockedPo.id },
            data: {
              status: nextStatus,
              fullyReceivedAt:
                nextStatus === PharmacyPurchaseOrderStatus.RECEIVED
                  ? new Date()
                  : undefined,
            },
          });
        }

        return tx.pharmacyPurchaseOrderReceipt.findUniqueOrThrow({
          where: { id: createdReceipt.id },
          include: receiptInclude,
        });
      });

      await this.auditService.log({
        action: 'PHARMACY_PO_STOCK_RECEIVED',
        entity: 'PharmacyPurchaseOrderReceipt',
        entityId: receipt.id,
        hospitalId: user.hospitalId,
        branchId: receipt.branchId,
        userId: user.sub,
        metadata: {
          purchaseOrderId,
          lineCount: receipt.lines.length,
          idempotencyKey,
        },
      });

      return receipt;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.pharmacyPurchaseOrderReceipt.findUnique(
          {
            where: {
              hospitalId_idempotencyKey: {
                hospitalId: user.hospitalId,
                idempotencyKey,
              },
            },
            include: receiptInclude,
          },
        );
        if (duplicate) {
          return duplicate;
        }
      }
      throw error;
    }
  }
}
