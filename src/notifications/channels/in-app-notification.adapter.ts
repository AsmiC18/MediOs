import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { StaffInAppNotificationService } from '../staff-in-app-notification.service';
import { NotificationService } from '../notification.service';

function readPayloadField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

@Injectable()
export class InAppNotificationAdapter {
  private readonly logger = new Logger(InAppNotificationAdapter.name);

  constructor(
    private readonly staffInAppNotificationService: StaffInAppNotificationService,
    private readonly notificationService: NotificationService,
  ) {}

  async dispatch(
    notification: Notification,
    context: { jobId: string; workerId: string },
  ): Promise<void> {
    const payload = notification.payload;
    const userId = readPayloadField(payload, 'staffUserId');
    if (!userId) {
      await this.notificationService.markFailed(
        notification.id,
        notification.hospitalId,
        'in_app_missing_staff_user_id',
      );
      return;
    }

    const title =
      readPayloadField(payload, 'title') ??
      readPayloadField(payload, 'summary') ??
      notification.category;
    const body =
      readPayloadField(payload, 'body') ??
      readPayloadField(payload, 'summary') ??
      notification.category;

    await this.staffInAppNotificationService.createFromDispatch({
      hospitalId: notification.hospitalId,
      branchId: notification.branchId,
      userId,
      category: notification.category,
      title,
      body,
      entityType: notification.category,
      entityId: readPayloadField(payload, 'entityId'),
    });

    await this.notificationService.markDispatched(
      notification.id,
      notification.hospitalId,
    );

    this.logger.log(
      JSON.stringify({
        event: 'in_app_notification_created',
        jobId: context.jobId,
        workerId: context.workerId,
        notificationId: notification.id,
        userId,
        hospitalId: notification.hospitalId,
      }),
    );
  }
}
