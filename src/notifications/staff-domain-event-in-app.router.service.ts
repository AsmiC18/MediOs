import { Injectable, Logger } from '@nestjs/common';
import { DomainEventOutbox, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { APPOINTMENT_BOOKED_EVENT_TYPE } from '../scheduling/appointments/appointment-booked-event.util';
import { APPOINTMENT_CANCELLED_EVENT_TYPE } from '../scheduling/appointments/appointment-cancelled-event.util';
import { APPOINTMENT_RESCHEDULED_EVENT_TYPE } from '../scheduling/appointments/appointment-rescheduled-event.util';
import { CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE } from '../clinical/events/clinical-prescription-event.util';
import { DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE } from '../diagnostics/diagnostic-order-completed-event.util';
import { INSURANCE_CLAIM_SUBMITTED_EVENT_TYPE } from '../insurance/insurance-claim-staff-event.util';
import { SURGERY_SCHEDULED_STAFF_EVENT_TYPE } from '../surgery/surgery-scheduled-staff-event.util';
import { APPOINTMENT_REMINDER_24H_EVENT_TYPE } from '../scheduling/appointments/appointment-reminder-24h-event.util';
import {
  APPOINTMENT_REMINDER_1H_EVENT_TYPE,
  APPOINTMENT_REMINDER_48H_EVENT_TYPE,
} from '../scheduling/appointments/appointment-reminder-policy.util';
import { StaffInAppNotificationService } from './staff-in-app-notification.service';

type StaffRouteSpec = {
  permissionName: string;
  title: string;
  bodyFromPayload: (payload: Record<string, unknown>) => string;
};

const STAFF_ROUTED_EVENTS: Record<string, StaffRouteSpec> = {
  [APPOINTMENT_BOOKED_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment booked',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'A new appointment was booked.',
  },
  [APPOINTMENT_CANCELLED_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment cancelled',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'An appointment was cancelled.',
  },
  [APPOINTMENT_RESCHEDULED_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment rescheduled',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'An appointment was rescheduled.',
  },
  [DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE]: {
    permissionName: 'diagnostics:read',
    title: 'Diagnostic order completed',
    bodyFromPayload: (p) =>
      readString(p, 'summary') ?? 'A diagnostic order was completed.',
  },
  [CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE]: {
    permissionName: 'pharmacy:read',
    title: 'Prescription ready for pharmacy',
    bodyFromPayload: () =>
      'A new prescription was created and may require pharmacy processing.',
  },
  [INSURANCE_CLAIM_SUBMITTED_EVENT_TYPE]: {
    permissionName: 'insurance:claims:manage',
    title: 'Insurance claim submitted',
    bodyFromPayload: (p) =>
      readString(p, 'summary') ?? 'An insurance claim was submitted.',
  },
  [SURGERY_SCHEDULED_STAFF_EVENT_TYPE]: {
    permissionName: 'surgery:read',
    title: 'Surgery scheduled',
    bodyFromPayload: (p) =>
      readString(p, 'summary') ?? 'A surgery was scheduled.',
  },
  [APPOINTMENT_REMINDER_48H_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment reminder (48h)',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'Upcoming appointment reminder (48h window).',
  },
  [APPOINTMENT_REMINDER_24H_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment reminder (24h)',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'Upcoming appointment reminder (24h window).',
  },
  [APPOINTMENT_REMINDER_1H_EVENT_TYPE]: {
    permissionName: 'scheduling:read',
    title: 'Appointment reminder (1h)',
    bodyFromPayload: (p) =>
      readString(p, 'text') ?? 'Upcoming appointment reminder (1h window).',
  },
};

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

@Injectable()
export class StaffDomainEventInAppRouterService {
  private readonly logger = new Logger(StaffDomainEventInAppRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffInAppNotificationService: StaffInAppNotificationService,
    private readonly auditService: AuditService,
  ) {}

  async routeFromOutbox(outbox: DomainEventOutbox): Promise<number> {
    const spec = STAFF_ROUTED_EVENTS[outbox.eventType];
    if (!spec) {
      return 0;
    }

    const payload = payloadRecord(outbox.payload);
    const userIds = await this.resolveStaffUserIds(
      outbox.hospitalId,
      outbox.branchId,
      spec.permissionName,
    );
    if (userIds.length === 0) {
      return 0;
    }

    const body = spec.bodyFromPayload(payload);
    let created = 0;

    for (const userId of userIds) {
      const existing = await this.prisma.staffInAppNotification.findFirst({
        where: {
          hospitalId: outbox.hospitalId,
          userId,
          category: outbox.eventType,
          entityType: 'DomainEventOutbox',
          entityId: outbox.id,
        },
      });
      if (existing) {
        continue;
      }

      await this.staffInAppNotificationService.createFromDispatch({
        hospitalId: outbox.hospitalId,
        branchId: outbox.branchId,
        userId,
        category: outbox.eventType,
        title: spec.title,
        body,
        entityType: 'DomainEventOutbox',
        entityId: outbox.id,
      });
      created += 1;
    }

    if (created > 0) {
      await this.auditService.log({
        action: 'STAFF_IN_APP_DOMAIN_EVENT_ROUTED',
        entity: 'DomainEventOutbox',
        entityId: outbox.id,
        hospitalId: outbox.hospitalId,
        branchId: outbox.branchId,
        userId: null,
        metadata: {
          eventType: outbox.eventType,
          recipientCount: created,
        },
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'staff_in_app_domain_event_routed',
        outboxId: outbox.id,
        eventType: outbox.eventType,
        created,
      }),
    );

    return created;
  }

  private async resolveStaffUserIds(
    hospitalId: string,
    branchId: string | null,
    permissionName: string,
  ): Promise<string[]> {
    const permission = await this.prisma.permission.findUnique({
      where: { name: permissionName },
    });
    if (!permission) {
      return [];
    }

    const roleLinks = await this.prisma.rolePermission.findMany({
      where: { permissionId: permission.id },
      select: { roleId: true },
    });
    const roleIds = [...new Set(roleLinks.map((r) => r.roleId))];
    if (roleIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        hospitalId,
        roleId: { in: roleIds },
        status: UserStatus.ACTIVE,
        ...(branchId
          ? { OR: [{ branchId }, { branchId: null }] }
          : {}),
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }
}
