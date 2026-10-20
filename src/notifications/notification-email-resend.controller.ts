import {
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { NotificationEmailResendService } from './notification-email-resend.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationEmailResendController {
  constructor(
    private readonly notificationEmailResendService: NotificationEmailResendService,
  ) {}

  @Post(':id/resend-email')
  @RequirePermissions('notifications:delivery:manage')
  resendEmail(@Request() req: { user: unknown }, @Param('id') id: string) {
    return this.notificationEmailResendService.resendFailedEmail(
      req.user as never,
      id,
    );
  }
}
