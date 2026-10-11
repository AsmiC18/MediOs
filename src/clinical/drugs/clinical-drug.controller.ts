import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { ClinicalDrugService } from './clinical-drug.service';
import { CreateClinicalDrugDto } from './dto/create-clinical-drug.dto';
import { UpdateClinicalDrugDto } from './dto/update-clinical-drug.dto';

@Controller('clinical/drugs')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.CLINICAL)
export class ClinicalDrugController {
  constructor(private readonly clinicalDrugService: ClinicalDrugService) {}

  @Post()
  @RequirePermissions('clinical:manage')
  create(@Request() req: any, @Body() dto: CreateClinicalDrugDto) {
    return this.clinicalDrugService.createDrug(req.user.hospitalId, dto);
  }

  @Get()
  @RequirePermissions('clinical:read')
  list(@Request() req: any, @Query('activeOnly') activeOnly?: string) {
    return this.clinicalDrugService.listDrugs(
      req.user.hospitalId,
      activeOnly === 'true',
    );
  }

  @Get(':id')
  @RequirePermissions('clinical:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.clinicalDrugService.getDrug(req.user.hospitalId, id);
  }

  @Patch(':id')
  @RequirePermissions('clinical:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClinicalDrugDto,
  ) {
    return this.clinicalDrugService.updateDrug(req.user.hospitalId, id, dto);
  }
}
