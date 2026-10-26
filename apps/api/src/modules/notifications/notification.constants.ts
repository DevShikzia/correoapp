export const NOTIFICATIONS_QUEUE_NAME = 'notifications';
export const NOTIFICATION_JOB_NAME = 'send-notification';

/**
 * BullMQ usa `:` como separador de sus claves internas y rechaza los `jobId`
 * personalizados que lo contienen. El reintento necesita un id nuevo porque un
 * `add` con un jobId ya completado se descarta.
 */
export function notificationJobId(notificationId: string, retryCount: number): string {
  return retryCount === 0 ? notificationId : `${notificationId}-r${retryCount}`;
}

// Un aviso recién creado puede estar esperando su primer encolado; solo se
// reconcilia cuando supera esta antigüedad para no duplicar trabajos en vuelo.
export const STALE_PENDING_AGE_MS = 2 * 60 * 1000;
export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
export const RECONCILE_BATCH_SIZE = 50;
export const RECONCILE_MAX_BATCHES = 20;
