import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../../config/env.js';
import {
  NOTIFICATION_JOB_NAME,
  NOTIFICATIONS_QUEUE_NAME,
  notificationJobId,
} from './notification.constants.js';
import type { NotificationQueue, NotificationLogger } from './notification.service.js';

const REDIS_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REDIS_PORT = 6379;

function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number(url.port) : DEFAULT_REDIS_PORT,
    ...(url.username.length > 0 ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password.length > 0 ? { password: decodeURIComponent(url.password) } : {}),
    ...(database !== undefined && Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  };
}

export function createBullNotificationQueue(
  redisUrl: string,
  logger: NotificationLogger,
): NotificationQueue {
  const queue = new Queue(NOTIFICATIONS_QUEUE_NAME, {
    connection: redisConnectionOptions(redisUrl),
    defaultJobOptions: {
      attempts: env.NOTIFICATION_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.NOTIFICATION_BACKOFF_MS },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
    },
  });

  queue.on('error', (error: unknown) => {
    logger.warn({ err: error }, 'cola de notificaciones: error de conexión con Redis');
  });

  return {
    async enqueue(notificationId: string, retryCount: number): Promise<void> {
      // El id del aviso como jobId evita duplicados si se encola dos veces.
      // Cada reintento necesita un jobId nuevo: BullMQ ignora un `add` con un
      // jobId que ya existe en el conjunto de completados.
      await queue.add(
        NOTIFICATION_JOB_NAME,
        { notificationId },
        { jobId: notificationJobId(notificationId, retryCount) },
      );
    },
  };
}
