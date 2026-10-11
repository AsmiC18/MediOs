import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { NotificationDeliveryStatsQueryDto } from './dto/notification-delivery-stats-query.dto';
import { NotificationDeliveryStatsService } from './notification-delivery-stats.service';

@Controller('notifications/delivery-stats')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationDeliveryStatsController {
  constructor(
    private readonly notificationDeliveryStatsService: NotificationDeliveryStatsService,
  ) {}

  @Get()
  @RequirePermissions('notifications:delivery:read')
  getStats(@Request() req: any, @Query() query: NotificationDeliveryStatsQueryDto) {
    return this.notificationDeliveryStatsService.getStats(req.user, query);
  }
}
