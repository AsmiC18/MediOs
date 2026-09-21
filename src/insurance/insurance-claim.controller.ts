import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  ApproveClaimDto,
  ClaimQueryDto,
  CreateClaimDto,
  RecordClaimPaymentDto,
  RejectClaimDto,
} from './dto/claim.dto';
import { InsuranceService } from './insurance.service';

@Controller('insurance/claims')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsuranceClaimController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreateClaimDto) {
    return this.insuranceService.createClaim(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any, @Query() query: ClaimQueryDto) {
    return this.insuranceService.listClaims(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('insurance:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.getClaim(req.user, id);
  }

  @Post(':id/submit')
  @RequirePermissions('insurance:manage')
  submit(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.submitClaim(req.user, id);
  }

  @Post(':id/review')
  @RequirePermissions('insurance:manage')
  review(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.reviewClaim(req.user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('insurance:manage')
  approve(@Request() req: any, @Param('id') id: string, @Body() dto: ApproveClaimDto) {
    return this.insuranceService.approveClaim(req.user, id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('insurance:manage')
  reject(@Request() req: any, @Param('id') id: string, @Body() dto: RejectClaimDto) {
    return this.insuranceService.rejectClaim(req.user, id, dto);
  }

  @Post(':id/record-payment')
  @RequirePermissions('insurance:manage')
  recordPayment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RecordClaimPaymentDto,
  ) {
    return this.insuranceService.recordClaimPayment(req.user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('insurance:manage')
  cancel(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.cancelClaim(req.user, id);
  }
}
