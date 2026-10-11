import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateEmergencyVisitDto } from './dto/create-emergency-visit.dto';
import { CreateTriageDto } from './dto/create-triage.dto';
import { EmergencyVisitQueryDto } from './dto/emergency-visit-query.dto';
import { EscalateDto } from './dto/escalate.dto';
import { SetDispositionDto } from './dto/set-disposition.dto';
import { EmergencyService } from './emergency.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('emergency/visits')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.EMERGENCY)
export class EmergencyVisitController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post()
  @RequirePermissions('emergency:manage')
  createVisit(@Request() req: any, @Body() dto: CreateEmergencyVisitDto) {
    return this.emergencyService.createVisit(req.user, dto);
  }

  @Get()
  @RequirePermissions('emergency:read')
  listVisits(@Request() req: any, @Query() query: EmergencyVisitQueryDto) {
    return this.emergencyService.listVisits(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('emergency:read')
  getVisit(@Request() req: any, @Param('id') id: string) {
    return this.emergencyService.getVisit(req.user, id);
  }

  @Post(':id/triage')
  @RequirePermissions('emergency:manage')
  createTriage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTriageDto,
  ) {
    return this.emergencyService.createTriage(req.user, id, dto);
  }

  @Get(':id/triage')
  @RequirePermissions('emergency:read')
  getTriageHistory(@Request() req: any, @Param('id') id: string) {
    return this.emergencyService.getTriageHistory(req.user, id);
  }

  @Post(':id/escalate')
  @RequirePermissions('emergency:manage')
  escalate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: EscalateDto,
  ) {
    return this.emergencyService.escalate(req.user, id, dto);
  }

  @Post(':id/start-treatment')
  @RequirePermissions('emergency:manage')
  startTreatment(@Request() req: any, @Param('id') id: string) {
    return this.emergencyService.startTreatment(req.user, id);
  }

  @Post(':id/disposition')
  @RequirePermissions('emergency:manage')
  setDisposition(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SetDispositionDto,
  ) {
    return this.emergencyService.setDisposition(req.user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('emergency:manage')
  cancelVisit(@Request() req: any, @Param('id') id: string) {
    return this.emergencyService.cancelVisit(req.user, id);
  }
}
