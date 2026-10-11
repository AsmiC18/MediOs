import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { applyBranchScope, resolveCreateBranchId } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateBillingCatalogueItemDto } from './dto/create-billing-catalogue-item.dto';
import { UpdateBillingCatalogueItemDto } from './dto/update-billing-catalogue-item.dto';

type User = { sub: string; hospitalId: string; branchId?: string | null };

@Injectable()
export class BillingCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: User, dto: CreateBillingCatalogueItemDto) {
    const branchId = resolveCreateBranchId(user, dto.branchId);
    try {
      const item = await this.prisma.billingCatalogueItem.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          itemType: dto.itemType,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          gstRate: new Prisma.Decimal(dto.gstRate ?? 0),
          hsnSac: dto.hsnSac?.trim() || null,
          pharmacyProductId: dto.pharmacyProductId ?? null,
          isActive: dto.isActive ?? true,
        },
      });
      await this.auditService.log({
        action: 'BILLING_CATALOGUE_ITEM_CREATED',
        entity: 'BillingCatalogueItem',
        entityId: item.id,
        hospitalId: user.hospitalId,
        branchId: item.branchId,
        userId: user.sub,
      });
      return item;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Catalogue code already exists');
      }
      throw error;
    }
  }

  async list(user: User, query: { activeOnly?: boolean; branchId?: string }) {
    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      ...(query.activeOnly ? { isActive: true } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    });
    return this.prisma.billingCatalogueItem.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async update(user: User, id: string, dto: UpdateBillingCatalogueItemDto) {
    const existing = await this.findOwned(user, id);
    const updated = await this.prisma.billingCatalogueItem.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.unitPrice !== undefined
          ? { unitPrice: new Prisma.Decimal(dto.unitPrice) }
          : {}),
        ...(dto.gstRate !== undefined
          ? { gstRate: new Prisma.Decimal(dto.gstRate) }
          : {}),
        ...(dto.hsnSac !== undefined ? { hsnSac: dto.hsnSac?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.auditService.log({
      action: 'BILLING_CATALOGUE_ITEM_UPDATED',
      entity: 'BillingCatalogueItem',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
    });
    return updated;
  }

  private async findOwned(user: User, id: string) {
    const item = await this.prisma.billingCatalogueItem.findFirst({
      where: applyBranchScope(user, { id, hospitalId: user.hospitalId }),
    });
    if (!item) {
      throw new NotFoundException('Catalogue item not found');
    }
    return item;
  }
}
