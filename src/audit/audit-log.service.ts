import {

  ForbiddenException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { applyBranchScope } from '../common/auth/branch-scope.util';

import { PrismaService } from '../common/prisma/prisma.service';

import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';

import { AuditLogQueryDto } from './dto/audit-log-query.dto';

import {

  AuditLogListItemDto,

  AuditLogListResponseDto,

} from './dto/audit-log-response.dto';

import {

  AUDIT_LOG_LIST_SELECT,

  AuditLogAuthenticatedUser,

} from './audit-log.types';



const DEFAULT_PAGE = 1;

const DEFAULT_LIMIT = 50;



const LIST_ORDER_BY: Prisma.AuditLogOrderByWithRelationInput[] = [

  { createdAt: 'desc' },

  { id: 'desc' },

];



@Injectable()

export class AuditLogQueryService {

  constructor(private readonly prisma: PrismaService) {}



  async list(

    user: AuditLogAuthenticatedUser,

    query: AuditLogQueryDto = {},

  ): Promise<AuditLogListResponseDto> {

    const where = await this.buildAuthorizedWhere(user, query);



    const page = query.page ?? DEFAULT_PAGE;

    const limit = query.limit ?? DEFAULT_LIMIT;



    const [total, rows] = await this.prisma.$transaction([

      this.prisma.auditLog.count({ where }),

      this.prisma.auditLog.findMany({

        where,

        select: AUDIT_LOG_LIST_SELECT,

        orderBy: LIST_ORDER_BY,

        skip: (page - 1) * limit,

        take: limit,

      }),

    ]);



    return {

      data: rows.map((row) => this.toListItem(row)),

      meta: {

        total,

        page,

        limit,

        totalPages: Math.ceil(total / limit) || 0,

      },

    };

  }



  /** Tenant- and branch-safe where clause shared by list and export. */

  async buildAuthorizedWhere(

    user: AuditLogAuthenticatedUser,

    filters: AuditLogFiltersDto,

  ): Promise<Prisma.AuditLogWhereInput> {

    if (user.branchId == null && filters.branchId) {

      await this.validateBranch(user, filters.branchId);

    }



    return this.buildWhere(user, filters);

  }



  async fetchAllForExport(

    user: AuditLogAuthenticatedUser,

    filters: AuditLogFiltersDto,

    maxRows: number,

  ): Promise<{ rows: AuditLogListItemDto[]; total: number }> {

    const where = await this.buildAuthorizedWhere(user, filters);

    const total = await this.prisma.auditLog.count({ where });

    if (total > maxRows) {
      return { total, rows: [] };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      select: AUDIT_LOG_LIST_SELECT,
      orderBy: LIST_ORDER_BY,
      take: maxRows,
    });



    return {

      total,

      rows: rows.map((row) => this.toListItem(row)),

    };

  }



  private buildWhere(

    user: AuditLogAuthenticatedUser,

    filters: AuditLogFiltersDto,

  ): Prisma.AuditLogWhereInput {

    const createdAt: Prisma.DateTimeFilter = {};

    if (filters.from !== undefined) {

      createdAt.gte = new Date(filters.from);

    }

    if (filters.to !== undefined) {

      createdAt.lt = new Date(filters.to);

    }



    const base: Prisma.AuditLogWhereInput = {

      hospitalId: user.hospitalId,

      ...(filters.userId !== undefined && { userId: filters.userId }),

      ...(filters.action !== undefined && { action: filters.action }),

      ...(filters.entity !== undefined && { entity: filters.entity }),

      ...(filters.entityId !== undefined && { entityId: filters.entityId }),

      ...(Object.keys(createdAt).length > 0 && { createdAt }),

    };



    if (user.branchId == null && filters.branchId !== undefined) {

      base.branchId = filters.branchId;

    }



    return applyBranchScope(user, base);

  }



  private async validateBranch(

    user: AuditLogAuthenticatedUser,

    branchId: string,

  ): Promise<void> {

    const branch = await this.prisma.branch.findUnique({

      where: { id: branchId },

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



  toListItem(row: {

    id: string;

    hospitalId: string;

    branchId: string | null;

    userId: string | null;

    action: string;

    entity: string;

    entityId: string | null;

    createdAt: Date;

  }): AuditLogListItemDto {

    return {

      id: row.id,

      hospitalId: row.hospitalId,

      branchId: row.branchId,

      actorUserId: row.userId,

      action: row.action,

      entity: row.entity,

      entityId: row.entityId,

      createdAt: row.createdAt,

    };

  }

}


