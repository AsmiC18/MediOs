import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from './audit.service';
import { serializeAuditLogsToCsv } from './audit-log-csv.util';
import { AuditLogQueryService } from './audit-log.service';
import {
  AuditLogExportDto,
  AuditLogExportFormat,
} from './dto/audit-log-export.dto';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';
import { AuditLogListItemDto } from './dto/audit-log-response.dto';
import {
  AUDIT_LOG_EXPORT_MAX_ROWS,
  AuditLogAuthenticatedUser,
} from './audit-log.types';

export type AuditLogExportResult =
  | { type: 'csv'; body: string; filename: string }
  | { type: 'json'; body: { data: AuditLogListItemDto[] } };

@Injectable()
export class AuditLogExportService {
  constructor(
    private readonly auditLogQueryService: AuditLogQueryService,
    private readonly auditService: AuditService,
  ) {}

  async export(
    user: AuditLogAuthenticatedUser,
    dto: AuditLogExportDto,
  ): Promise<AuditLogExportResult> {
    const { rows, total } = await this.auditLogQueryService.fetchAllForExport(
      user,
      dto,
      AUDIT_LOG_EXPORT_MAX_ROWS,
    );

    if (total > AUDIT_LOG_EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Export exceeds the maximum of ${AUDIT_LOG_EXPORT_MAX_ROWS} rows (${total} matched). Narrow your filters.`,
      );
    }

    let result: AuditLogExportResult;
    if (dto.format === AuditLogExportFormat.CSV) {
      result = {
        type: 'csv',
        body: serializeAuditLogsToCsv(rows),
        filename: this.buildCsvFilename(),
      };
    } else {
      result = {
        type: 'json',
        body: { data: rows },
      };
    }

    await this.auditService.log({
      action: 'AUDIT_LOG_EXPORTED',
      entity: 'AuditLog',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? dto.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        format: dto.format,
        filterSummary: this.buildFilterSummary(dto),
        resultCount: rows.length,
      },
    });

    return result;
  }

  private buildFilterSummary(
    filters: AuditLogFiltersDto,
  ): Record<string, string> {
    const summary: Record<string, string> = {};
    if (filters.branchId !== undefined) {
      summary.branchId = filters.branchId;
    }
    if (filters.userId !== undefined) {
      summary.userId = filters.userId;
    }
    if (filters.action !== undefined) {
      summary.action = filters.action;
    }
    if (filters.entity !== undefined) {
      summary.entity = filters.entity;
    }
    if (filters.entityId !== undefined) {
      summary.entityId = filters.entityId;
    }
    if (filters.from !== undefined) {
      summary.from = filters.from;
    }
    if (filters.to !== undefined) {
      summary.to = filters.to;
    }
    return summary;
  }

  private buildCsvFilename(): string {
    const day = new Date().toISOString().slice(0, 10);
    return `audit-logs-${day}.csv`;
  }
}
