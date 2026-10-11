import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateSupplierDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PharmacySupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async findOwnedSupplier(user: AuthenticatedUser, supplierId: string) {
    const supplier = await this.prisma.pharmacySupplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier || supplier.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pharmacy supplier not found');
    }

    return supplier;
  }

  async createSupplier(user: AuthenticatedUser, dto: CreateSupplierDto) {
    let supplier;

    try {
      supplier = await this.prisma.pharmacySupplier.create({
        data: {
          hospitalId: user.hospitalId,
          name: dto.name.trim(),
          code: dto.code?.trim() || null,
          contactName: dto.contactName?.trim(),
          phone: dto.phone?.trim(),
          email: dto.email?.trim(),
          address: dto.address?.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Supplier code already exists');
      }
      throw error;
    }

    await this.auditService.log({
      action: 'PHARMACY_SUPPLIER_CREATED',
      entity: 'PharmacySupplier',
      entityId: supplier.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { name: supplier.name, code: supplier.code },
    });

    return supplier;
  }

  async listSuppliers(user: AuthenticatedUser, query: SupplierQueryDto) {
    const where: Prisma.PharmacySupplierWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.pharmacySupplier.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getSupplier(user: AuthenticatedUser, supplierId: string) {
    return this.findOwnedSupplier(user, supplierId);
  }

  async updateSupplier(
    user: AuthenticatedUser,
    supplierId: string,
    dto: UpdateSupplierDto,
  ) {
    const existing = await this.findOwnedSupplier(user, supplierId);

    let supplier;

    try {
      supplier = await this.prisma.pharmacySupplier.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          code: dto.code !== undefined ? dto.code?.trim() || null : undefined,
          contactName: dto.contactName?.trim(),
          phone: dto.phone?.trim(),
          email: dto.email?.trim(),
          address: dto.address?.trim(),
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Supplier code already exists');
      }
      throw error;
    }

    await this.auditService.log({
      action:
        dto.isActive === false
          ? 'PHARMACY_SUPPLIER_DEACTIVATED'
          : 'PHARMACY_SUPPLIER_UPDATED',
      entity: 'PharmacySupplier',
      entityId: supplier.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { isActive: supplier.isActive },
    });

    return supplier;
  }
}
