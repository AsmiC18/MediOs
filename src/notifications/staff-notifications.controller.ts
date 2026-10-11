import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { StaffInAppNotificationService } from './staff-in-app-notification.service';
import { StaffNotificationQueryDto } from './dto/staff-notification-query.dto';

@Controller('staff/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffNotificationsController {
  constructor(
    private readonly staffInAppNotificationService: StaffInAppNotificationService,
  ) {}

  @Get()
  @RequirePermissions('staff-notifications:read')
  list(@Request() req: any, @Query() query: StaffNotificationQueryDto) {
    return this.staffInAppNotificationService.listForUser(req.user, query);
  }

  @Get('unread-count')
  @RequirePermissions('staff-notifications:read')
  unreadCount(@Request() req: any) {
    return this.staffInAppNotificationService.unreadCount(req.user);
  }

  @Patch('read-all')
  @RequirePermissions('staff-notifications:manage')
  markAllRead(@Request() req: any) {
    return this.staffInAppNotificationService.markAllRead(req.user);
  }

  @Patch(':id/read')
  @RequirePermissions('staff-notifications:manage')
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.staffInAppNotificationService.markRead(req.user, id);
  }
}
