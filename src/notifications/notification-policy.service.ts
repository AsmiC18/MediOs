import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Notification } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFICATION_CHANNEL_WHATSAPP } from './notification.constants';
import { getNotificationPolicyMetadata } from './notification-policy-metadata.util';
import {
  NOTIFICATION_POLICY_SKIP_REASON,
  NotificationPolicySkipReasonCode,
} from './notification-policy.constants';
import {
  NotificationPolicyDecision,
  NotificationPolicyEvaluationContext,
  NotificationPolicySkipDecision,
} from './notification-policy.types';
import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

@Injectable()
export class NotificationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientNotificationPreferenceService: PatientNotificationPreferenceService,
  ) {}

  async evaluate(
    notification: Notification,
    _context?: NotificationPolicyEvaluationContext,
  ): Promise<NotificationPolicyDecision> {
    const metadata = getNotificationPolicyMetadata(notification.category);

    if (notification.channel !== NOTIFICATION_CHANNEL_WHATSAPP) {
      return { action: 'ALLOW' };
    }

    if (
      !metadata.requiresPatientWhatsAppPreference &&
      !metadata.requiresAppointmentValidation
    ) {
      return { action: 'ALLOW' };
    }

    if (!notification.patientId) {
      if (metadata.requiresPatientWhatsAppPreference) {
        return this.skip(NOTIFICATION_POLICY_SKIP_REASON.NO_PATIENT);
      }
      return { action: 'ALLOW' };
    }

    const whatsAppEnabled =
      await this.patientNotificationPreferenceService.isWhatsAppTransactionalEnabled(
        notification.hospitalId,
        notification.patientId,
      );
    if (
      metadata.requiresPatientWhatsAppPreference &&
      !whatsAppEnabled
    ) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT);
    }

    if (metadata.requiresAppointmentValidation) {
      const appointmentDecision = await this.validateAppointmentForReminder(
        notification,
      );
      if (appointmentDecision) {
        return appointmentDecision;
      }
    }

    return { action: 'ALLOW' };
  }

  private skip(
    reasonCode: NotificationPolicySkipReasonCode,
  ): NotificationPolicySkipDecision {
    return { action: 'SKIP', reasonCode };
  }

  private async validateAppointmentForReminder(
    notification: Notification,
  ): Promise<NotificationPolicySkipDecision | null> {
    const appointmentId = this.resolveAppointmentId(notification);
    if (!appointmentId) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_NOT_FOUND);
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: notification.hospitalId,
      },
    });

    if (!appointment) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_NOT_FOUND);
    }

    if (appointment.hospitalId !== notification.hospitalId) {
      return this.skip(
        NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_HOSPITAL_MISMATCH,
      );
    }

    if (
      notification.patientId &&
      appointment.patientId !== notification.patientId
    ) {
      return this.skip(
        NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_PATIENT_MISMATCH,
      );
    }

    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_NOT_SCHEDULED);
    }

    const scheduledAt = this.extractScheduledAtSnapshot(notification);
    if (!scheduledAt) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED);
    }

    const snapshotMs = new Date(scheduledAt).getTime();
    const currentMs = appointment.startAt.getTime();
    if (
      !Number.isFinite(snapshotMs) ||
      snapshotMs !== currentMs
    ) {
      return this.skip(NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED);
    }

    return null;
  }

  private resolveAppointmentId(notification: Notification): string | null {
    const payload = notification.payload as Record<string, unknown>;
    const entityType = payload.entityType;
    const entityId = payload.entityId;
    if (entityType === 'Appointment' && typeof entityId === 'string') {
      return entityId;
    }

    const data = this.extractPayloadData(notification);
    if (typeof data.appointmentId === 'string') {
      return data.appointmentId;
    }

    return null;
  }

  private extractScheduledAtSnapshot(
    notification: Notification,
  ): string | null {
    const data = this.extractPayloadData(notification);
    const scheduledAt = data.scheduledAt;
    return typeof scheduledAt === 'string' && scheduledAt.length > 0
      ? scheduledAt
      : null;
  }

  private extractPayloadData(
    notification: Notification,
  ): Record<string, unknown> {
    const payload = notification.payload as Record<string, unknown>;
    if (
      payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data)
    ) {
      return payload.data as Record<string, unknown>;
    }
    return payload;
  }
}
