/** Notification exists but has not been handed to a channel adapter (H2). */
export const NOTIFICATION_CHANNEL_UNROUTED = 'unrouted';

/** Outbox/notification channel; dispatch marks SKIPPED when policy allows (no WhatsApp provider wired). */
export const NOTIFICATION_CHANNEL_WHATSAPP = 'whatsapp';

/** Persist staff in-app notification (internal). */
export const NOTIFICATION_CHANNEL_IN_APP = 'in_app';

/** Email adapter (provider must be configured). */
export const NOTIFICATION_CHANNEL_EMAIL = 'email';

/**
 * Stored in notification.lastError when WhatsApp dispatch is intentionally not
 * handed off (Phase A decouple — no adapter on the dispatch path).
 */
export const NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED =
  'channel_not_configured';
