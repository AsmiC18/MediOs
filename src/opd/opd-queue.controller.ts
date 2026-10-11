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
import { CheckInDto } from './dto/check-in.dto';
import { QueueQueryDto } from './dto/queue-query.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { OpdQueueService } from './opd-queue.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('opd/queue')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.OPD)
export class OpdQueueController {
  constructor(private readonly opdQueueService: OpdQueueService) {}

  @Post('check-in')
  @RequirePermissions('opd:manage')
  checkIn(@Request() req: any, @Body() dto: CheckInDto) {
    return this.opdQueueService.checkIn(req.user, dto);
  }

  @Get()
  @RequirePermissions('opd:read')
  listQueue(@Request() req: any, @Query() query: QueueQueryDto) {
    return this.opdQueueService.listQueue(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('opd:read')
  getQueueEntry(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.getQueueEntry(req.user, id);
  }

  @Post(':id/call')
  @RequirePermissions('opd:manage')
  callPatient(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.callPatient(req.user, id);
  }

  @Post(':id/start')
  @RequirePermissions('opd:manage')
  startConsultation(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.startConsultation(req.user, id);
  }

  @Post(':id/complete')
  @RequirePermissions('opd:manage')
  completeConsultation(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.completeConsultation(req.user, id);
  }

  @Post(':id/no-show')
  @RequirePermissions('opd:manage')
  markNoShow(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.markNoShow(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('opd:manage')
  cancelQueueEntry(@Request() req: any, @Param('id') id: string) {
    return this.opdQueueService.cancelQueueEntry(req.user, id);
  }

  @Patch(':id/priority')
  @RequirePermissions('opd:manage')
  updatePriority(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.opdQueueService.updatePriority(req.user, id, dto);
  }
}
