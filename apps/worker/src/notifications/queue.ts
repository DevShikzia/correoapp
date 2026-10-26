import { Queue, type ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';
import {
  NOTIFICATION_JOB_NAME,
  NOTIFICATIONS_QUEUE_NAME,
  notificationJobId,
} from './notification.constants.js';
import type { ProcessorLogger } from './process-notification.js';

const DEFAULT_REDIS_PORT = 6379;
const REDIS_CONNECT_TIMEOUT_MS = 3_000;

function redisConnectionBase(redisUrl: string) {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number(url.port) : DEFAULT_REDIS_PORT,
    ...(url.username.length > 0 ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password.length > 0 ? { password: decodeURIComponent(url.password) } : {}),
    ...(database !== undefined && Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  return {
    ...redisConnectionBase(redisUrl),
    // Requisito de BullMQ para conexiones bloqueantes de Worker.
    maxRetriesPerRequest: null,
  };
}

function redisQueueConnectionOptions(redisUrl: string): ConnectionOptions {
  return {
    ...redisConnectionBase(redisUrl),
    // La reconciliación no debe colgarse si Redis está caído: falla rápido.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  };
}

export interface NotificationQueue {
  enqueue(notificationId: string, retryCount: number): Promise<void>;
  close(): Promise<void>;
}

export function createNotificationQueue(
  redisUrl: string,
  logger: ProcessorLogger,
): NotificationQueue {
  const queue = new Queue(NOTIFICATIONS_QUEUE_NAME, {
    connection: redisQueueConnectionOptions(redisUrl),
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
      // Cada reintento manual usa un jobId distinto para que BullMQ no lo
      // descarte por existir ya uno completado con el mismo id.
      await queue.add(
        NOTIFICATION_JOB_NAME,
        { notificationId },
        { jobId: notificationJobId(notificationId, retryCount) },
      );
    },

    async close(): Promise<void> {
      await queue.close();
    },
  };
}
