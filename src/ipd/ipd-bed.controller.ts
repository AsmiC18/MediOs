import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { BedQueryDto } from './dto/bed-query.dto';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { IpdBedService } from './ipd-bed.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('ipd/beds')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.IPD)
export class IpdBedController {
  constructor(private readonly bedService: IpdBedService) {}

  @Post()
  @RequirePermissions('ipd:manage')
  createBed(@Request() req: any, @Body() dto: CreateBedDto) {
    return this.bedService.createBed(req.user, dto);
  }

  @Get()
  @RequirePermissions('ipd:read')
  listBeds(@Request() req: any, @Query() query: BedQueryDto) {
    return this.bedService.listBeds(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('ipd:read')
  getBed(@Request() req: any, @Param('id') id: string) {
    return this.bedService.getBed(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('ipd:manage')
  updateBed(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBedDto,
  ) {
    return this.bedService.updateBed(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ipd:manage')
  deactivateBed(@Request() req: any, @Param('id') id: string) {
    return this.bedService.deactivateBed(req.user, id);
  }
}
