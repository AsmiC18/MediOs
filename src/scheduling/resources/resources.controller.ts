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
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService } from './resources.service';

@Controller('resources')
@UseGuards(JwtAuthGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateResourceDto) {
    return this.resourcesService.create(req.user, dto);
  }

  @Get()
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
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.resourcesService.findOne(req.user, id);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resourcesService.update(req.user, id, dto);
  }

  @Delete(':id')
  deactivate(@Request() req: any, @Param('id') id: string) {
    return this.resourcesService.deactivate(req.user, id);
  }
}
