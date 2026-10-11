import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import { Icd10SearchQueryDto } from './dto/icd10-search-query.dto';
import { Icd10Service } from './icd10.service';

@Controller('clinical/icd10')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.CLINICAL)
export class Icd10Controller {
  constructor(private readonly icd10Service: Icd10Service) {}

  @Get()
  @RequirePermissions('clinical:read')
  search(@Query() query: Icd10SearchQueryDto) {
    return this.icd10Service.search(query);
  }
}
