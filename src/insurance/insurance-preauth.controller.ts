import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  ApprovePreAuthorizationDto,
  CreatePreAuthorizationDto,
  PreAuthorizationQueryDto,
  RejectPreAuthorizationDto,
} from './dto/preauth.dto';
import { InsuranceService } from './insurance.service';

@Controller('insurance/pre-authorizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsurancePreauthController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreatePreAuthorizationDto) {
    return this.insuranceService.createPreAuthorization(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any, @Query() query: PreAuthorizationQueryDto) {
    return this.insuranceService.listPreAuthorizations(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('insurance:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.getPreAuthorization(req.user, id);
  }

  @Post(':id/submit')
  @RequirePermissions('insurance:manage')
  submit(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.submitPreAuthorization(req.user, id);
  }

  @Post(':id/review')
  @RequirePermissions('insurance:manage')
  review(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.reviewPreAuthorization(req.user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('insurance:manage')
  approve(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ApprovePreAuthorizationDto,
  ) {
    return this.insuranceService.approvePreAuthorization(req.user, id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('insurance:manage')
  reject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RejectPreAuthorizationDto,
  ) {
    return this.insuranceService.rejectPreAuthorization(req.user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('insurance:manage')
  cancel(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.cancelPreAuthorization(req.user, id);
  }
}
