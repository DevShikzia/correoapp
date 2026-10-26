export const NOTIFICATIONS_QUEUE_NAME = 'notifications';
export const NOTIFICATION_JOB_NAME = 'send-notification';

// Espejo de `apps/api`: BullMQ rechaza `:` dentro de un jobId personalizado.
export function notificationJobId(notificationId: string, retryCount: number): string {
  return retryCount === 0 ? notificationId : `${notificationId}-r${retryCount}`;
}
export const LOT_NUMBER_PATTERN = /^[0-9]{1,6}$/;
export const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
export const MAX_ERROR_CODE_LENGTH = 64;

// Espejo de `apps/api`: un aviso `pending` más nuevo puede estar esperando su
// primer encolado y no debe reconciliarse todavía.
export const STALE_PENDING_AGE_MS = 2 * 60 * 1000;
export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const RECONCILE_BATCH_SIZE = 50;
export const RECONCILE_MAX_BATCHES = 20;
