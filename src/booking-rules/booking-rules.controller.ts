import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { BookingRulesService } from './booking-rules.service';
import { CreateBookingRuleDto } from './dto/create-booking-rule.dto';
import { UpdateBookingRuleDto } from './dto/update-booking-rule.dto';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('booking-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class BookingRulesController {
  constructor(private readonly bookingRulesService: BookingRulesService) {}

  @Post()
  @RequirePermissions('booking-rules:manage')
  create(@Request() req: any, @Body() dto: CreateBookingRuleDto) {
    return this.bookingRulesService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('booking-rules:read')
  findAll(@Request() req: any) {
    return this.bookingRulesService.findAll(req.user);
  }

  @Patch('branch/:branchId/remove')
  @RequirePermissions('booking-rules:manage')
  removeBranchOverride(
    @Request() req: any,
    @Param('branchId') branchId: string,
  ) {
    return this.bookingRulesService.removeBranchOverride(req.user, branchId);
  }

  @Get(':id')
  @RequirePermissions('booking-rules:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.findOne(req.user, id);
  }

  @Patch(':id/set-hospital-default')
  @RequirePermissions('booking-rules:manage')
  setHospitalDefault(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.setHospitalDefault(req.user, id);
  }

  @Patch(':id/assign-branch/:branchId')
  @RequirePermissions('booking-rules:manage')
  assignBranch(
    @Request() req: any,
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.bookingRulesService.assignBranch(req.user, id, branchId);
  }

  @Patch(':id')
  @RequirePermissions('booking-rules:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBookingRuleDto,
  ) {
    return this.bookingRulesService.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('booking-rules:manage')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.remove(req.user, id);
  }
}
