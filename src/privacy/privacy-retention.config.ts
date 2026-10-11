import { isProduction } from '../common/config/app-environment';



export type PrivacyRetentionConfig = {

  enabled: boolean;

  auditLogRetentionDays: number;

  whatsAppMessageRetentionDays: number;

  notificationRetentionDays: number;

  batchSize: number;

};



function readBoolean(envValue: string | undefined, fallback: boolean): boolean {

  if (envValue === undefined || envValue.trim() === '') {

    return fallback;

  }

  const normalized = envValue.trim().toLowerCase();

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {

    return true;

  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {

    return false;

  }

  return fallback;

}



function readPositiveInt(envValue: string | undefined, fallback: number): number {

  if (envValue === undefined || envValue.trim() === '') {

    return fallback;

  }

  const parsed = Number.parseInt(envValue, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {

    return fallback;

  }

  return parsed;

}



export function loadPrivacyRetentionConfig(): PrivacyRetentionConfig {

  return {

    enabled: readBoolean(process.env.PRIVACY_RETENTION_ENABLED, false),

    auditLogRetentionDays: readPositiveInt(

      process.env.PRIVACY_RETENTION_AUDIT_LOG_DAYS,

      365,

    ),

    whatsAppMessageRetentionDays: readPositiveInt(

      process.env.PRIVACY_RETENTION_WHATSAPP_MESSAGE_DAYS,

      90,

    ),

    notificationRetentionDays: readPositiveInt(

      process.env.PRIVACY_RETENTION_NOTIFICATION_DAYS,

      90,

    ),

    batchSize: readPositiveInt(process.env.PRIVACY_RETENTION_BATCH_SIZE, 200),

  };

}



/** Validates retention env when purge is enabled in production. */

export function validatePrivacyRetentionProductionConfig(): void {

  if (!isProduction()) {

    return;

  }



  if (!loadPrivacyRetentionConfig().enabled) {
    return;
  }

  const assertPositiveIntEnv = (name: string) => {
    const raw = process.env[name]?.trim();
    if (!raw) {
      throw new Error(
        `${name} is required when PRIVACY_RETENTION_ENABLED=true in production.`,
      );
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(
        `${name} must be a positive integer when PRIVACY_RETENTION_ENABLED=true in production.`,
      );
    }
  };

  assertPositiveIntEnv('PRIVACY_RETENTION_AUDIT_LOG_DAYS');
  assertPositiveIntEnv('PRIVACY_RETENTION_WHATSAPP_MESSAGE_DAYS');
  assertPositiveIntEnv('PRIVACY_RETENTION_NOTIFICATION_DAYS');
  assertPositiveIntEnv('PRIVACY_RETENTION_BATCH_SIZE');
}


