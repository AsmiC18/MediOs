import {
  Body,
  Controller,
  Get,
  Param,
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
import { AttendanceService } from './attendance.service';
import { AttendanceExportService } from './attendance-export.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendancePayrollExportDto } from './dto/attendance-payroll-export.dto';
import { ClockInDto } from './dto/clock-in.dto';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.ATTENDANCE)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceExportService: AttendanceExportService,
  ) {}

  @Post('clock-in')
  @RequirePermissions('attendance:manage')
  clockIn(@Request() req: any, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(req.user, dto);
  }

  @Post('clock-out')
  @RequirePermissions('attendance:manage')
  clockOut(@Request() req: any) {
    return this.attendanceService.clockOut(req.user);
  }

  @Get('export/payroll')
  @RequirePermissions('attendance:export')
  async exportPayroll(
    @Request() req: any,
    @Query() query: AttendancePayrollExportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.attendanceExportService.exportPayroll(
      req.user,
      query,
    );
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

  @Get()
  @RequirePermissions('attendance:read')
  findAll(@Request() req: any, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.findAll(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('attendance:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.attendanceService.findOne(req.user, id);
  }
}
