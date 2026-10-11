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

import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';

import { InsuranceAgeingQueryDto } from './dto/insurance-ageing-query.dto';

import { ReportAsOfQueryDto } from './dto/report-as-of-query.dto';

import { ReportDateRangeDto } from './dto/report-date-range.dto';

import { ReportExportDto } from './dto/report-export.dto';

import { ReportExportPermissionsGuard } from './guards/report-export-permissions.guard';

import { ReportsService } from './reports.service';

import { ReportAuthenticatedUser } from './reports.types';

import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('reports')

@UseGuards(JwtAuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.REPORTING)

export class ReportsController {

  constructor(private readonly reportsService: ReportsService) {}



  @Get('financial/summary')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async financialSummary(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getFinancialSummary(

      req.user,

      query,

    );

    await this.reportsService.logReportViewed(req.user, 'financial', query);

    return result;

  }



  @Get('insurance/ageing')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('insurance:reports:read')

  async insuranceAgeing(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: InsuranceAgeingQueryDto,

  ) {

    const result = await this.reportsService.getInsuranceClaimsAgeing(

      req.user,

      query,

    );

    await this.reportsService.logReportViewed(req.user, 'insurance_ageing', query);

    return result;

  }



  @Get('pharmacy/sales')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async pharmacySales(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getPharmacySalesSummary(

      req.user,

      query,

    );

    await this.reportsService.logReportViewed(req.user, 'pharmacy_sales', query);

    return result;

  }



  @Get('pharmacy/inventory')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async pharmacyInventory(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getPharmacyInventorySummary(

      req.user,

      query,

    );

    await this.reportsService.logReportViewed(

      req.user,

      'pharmacy_inventory',

      query,

    );

    return result;

  }



  @Get('pharmacy/shrink')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async pharmacyShrink(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getPharmacyShrinkSummary(

      req.user,

      query,

    );

    await this.reportsService.logReportViewed(req.user, 'pharmacy_shrink', query);

    return result;

  }



  @Get('gst/summary')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async gstSummary(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getGstSummary(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'gst', query);

    return result;

  }



  @Get('dashboard/daily')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async dailyDashboard(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getDailyDashboard(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'dashboard_daily', query);

    return result;

  }



  @Get('opd/metrics')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async opdMetrics(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getOpdMetrics(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'opd_metrics', query);

    return result;

  }



  @Get('ipd/occupancy')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async ipdOccupancy(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportAsOfQueryDto,

  ) {

    const result = await this.reportsService.getIpdOccupancy(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'ipd_occupancy', {

      from: query.asOf,

      to: query.asOf,

      branchId: query.branchId,

    });

    return result;

  }



  @Get('departments/revenue')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async departmentRevenue(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getDepartmentRevenue(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'department_revenue', query);

    return result;

  }



  @Get('patients/cohort')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async patientCohort(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getPatientCohort(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'patient_cohort', query);

    return result;

  }



  @Get('abdm/adoption')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async abdmAdoption(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getAbdmAdoption(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'abdm_adoption', query);

    return result;

  }



  @Get('doctors/performance')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('reports:read')

  async doctorPerformance(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: ReportDateRangeDto,

  ) {

    const result = await this.reportsService.getDoctorPerformance(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'doctor_performance', query);

    return result;

  }



  @Get('attendance/summary')

  @UseGuards(PermissionsGuard)

  @RequirePermissions('attendance:read')

  async attendanceSummary(

    @Request() req: { user: ReportAuthenticatedUser },

    @Query() query: AttendanceSummaryQueryDto,

  ) {

    const result = await this.reportsService.getAttendanceSummary(req.user, query);

    await this.reportsService.logReportViewed(req.user, 'attendance_summary', {

      from: `${query.periodYear}-${String(query.periodMonth).padStart(2, '0')}-01T00:00:00.000Z`,

      to: `${query.periodYear}-${String(query.periodMonth).padStart(2, '0')}-01T00:00:00.000Z`,

      branchId: query.branchId,

    });

    return result;

  }



  @Post('exports')

  @UseGuards(ReportExportPermissionsGuard)

  async exportReport(

    @Request() req: { user: ReportAuthenticatedUser },

    @Body() body: ReportExportDto,

    @Res({ passthrough: true }) res: Response,

  ) {

    const result = await this.reportsService.exportReport(req.user, body);



    if (result.type === 'csv') {

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="${result.filename}"`,

      );

      return result.body;

    }

    if (result.type === 'pdf') {

      res.setHeader('Content-Type', 'application/pdf');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="${result.filename}"`,

      );

      return result.body;

    }



    return result.body;

  }

}


