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
import { AdmissionQueryDto } from './dto/admission-query.dto';
import { AllocateBedDto } from './dto/allocate-bed.dto';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { TransferBedDto } from './dto/transfer-bed.dto';
import { IpdAdmissionService } from './ipd-admission.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('ipd/admissions')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.IPD)
export class IpdAdmissionController {
  constructor(private readonly admissionService: IpdAdmissionService) {}

  @Post()
  @RequirePermissions('ipd:manage')
  createAdmission(@Request() req: any, @Body() dto: CreateAdmissionDto) {
    return this.admissionService.createAdmission(req.user, dto);
  }

  @Get()
  @RequirePermissions('ipd:read')
  listAdmissions(@Request() req: any, @Query() query: AdmissionQueryDto) {
    return this.admissionService.listAdmissions(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('ipd:read')
  getAdmission(@Request() req: any, @Param('id') id: string) {
    return this.admissionService.getAdmission(req.user, id);
  }

  @Post(':id/bed')
  @RequirePermissions('ipd:manage')
  allocateBed(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: AllocateBedDto,
  ) {
    return this.admissionService.allocateBed(req.user, id, dto);
  }

  @Post(':id/transfer')
  @RequirePermissions('ipd:manage')
  transferBed(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: TransferBedDto,
  ) {
    return this.admissionService.transferBed(req.user, id, dto);
  }

  @Post(':id/discharge')
  @RequirePermissions('ipd:manage')
  discharge(@Request() req: any, @Param('id') id: string) {
    return this.admissionService.discharge(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('ipd:manage')
  cancelAdmission(@Request() req: any, @Param('id') id: string) {
    return this.admissionService.cancelAdmission(req.user, id);
  }
}
