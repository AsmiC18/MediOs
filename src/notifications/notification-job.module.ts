import { Module } from '@nestjs/common';
import { NotificationDispatchJobHandler } from './notification-dispatch.job-handler';
import { NotificationsModule } from './notifications.module';

/** Notification dispatch handler for background workers (no HTTP controllers). */
@Module({
  imports: [NotificationsModule],
  providers: [NotificationDispatchJobHandler],
  exports: [NotificationDispatchJobHandler],
})
export class NotificationJobModule {}
