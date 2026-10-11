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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveService } from './leave.service';

@Controller('leaves')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  @RequirePermissions('leave:manage')
  create(@Request() req: any, @Body() dto: CreateLeaveDto) {
    return this.leaveService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('leave:read')
  findAll(@Request() req: any, @Query() query: LeaveQueryDto) {
    return this.leaveService.findAll(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('leave:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.leaveService.findOne(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('leave:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveDto,
  ) {
    return this.leaveService.update(req.user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('leave:manage')
  cancel(@Request() req: any, @Param('id') id: string) {
    return this.leaveService.cancel(req.user, id);
  }
}
