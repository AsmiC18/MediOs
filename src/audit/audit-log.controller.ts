import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuditLogExportService } from './audit-log-export.service';
import { AuditLogQueryService } from './audit-log.service';
import { AuditLogExportDto } from './dto/audit-log-export.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogAuthenticatedUser } from './audit-log.types';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(
    private readonly auditLogQueryService: AuditLogQueryService,
    private readonly auditLogExportService: AuditLogExportService,
  ) {}

  @Get()
  @RequirePermissions('audit:read')
  list(
    @Request() req: { user: AuditLogAuthenticatedUser },
    @Query() query: AuditLogQueryDto,
  ) {
    return this.auditLogQueryService.list(req.user, query);
  }

  @Post('export')
  @RequirePermissions('audit:export')
  async export(
    @Request() req: { user: AuditLogAuthenticatedUser },
    @Body() body: AuditLogExportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auditLogExportService.export(req.user, body);

    if (result.type === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      return result.body;
    }

    return result.body;
  }
}
