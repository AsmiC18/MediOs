import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ResourceStatus, ResourceType } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService } from './resources.service';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';

@Controller('resources')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  @RequirePermissions('scheduling:manage')
  create(@Request() req: any, @Body() dto: CreateResourceDto) {
    return this.resourcesService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('scheduling:read')
  findAll(
    @Request() req: any,
    @Query('type', new ParseEnumPipe(ResourceType, { optional: true }))
    type?: ResourceType,
    @Query('status', new ParseEnumPipe(ResourceStatus, { optional: true }))
    status?: ResourceStatus,
    @Query('branchId') branchId?: string,
  ) {
    return this.resourcesService.findAll(req.user, {
      type,
      status,
      branchId,
    });
  }

  @Get(':id')
  @RequirePermissions('scheduling:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.resourcesService.findOne(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('scheduling:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resourcesService.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('scheduling:manage')
  deactivate(@Request() req: any, @Param('id') id: string) {
    return this.resourcesService.deactivate(req.user, id);
  }
}
