import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { NOTIFICATIONS_QUEUE_NAME } from './notifications/notification.constants.js';
import {
  RECONCILE_BATCH_SIZE,
  RECONCILE_INTERVAL_MS,
  RECONCILE_MAX_BATCHES,
  STALE_PENDING_AGE_MS,
} from './notifications/notification.constants.js';
import {
  notificationJobRepository,
  notificationRequeueRepository,
} from './notifications/notification.repository.js';
import { createNotificationProcessor } from './notifications/process-notification.js';
import type { NotificationJobData } from './notifications/process-notification.js';
import { createNotificationProvider } from './notifications/provider-factory.js';
import { createNotificationQueue, redisConnectionOptions } from './notifications/queue.js';
import { createNotificationReconciler } from './notifications/reconcile.js';
import { startReconcileScheduler } from './notifications/reconcile-scheduler.js';

const KEEP_ALIVE_INTERVAL_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function runIdle(): void {
  logger.warn(
    'notificaciones deshabilitadas (NOTIFICATIONS_ENABLED=false); el worker queda a la espera',
  );

  const keepAlive = setInterval(() => {
    logger.debug('worker a la espera de tareas');
  }, KEEP_ALIVE_INTERVAL_MS);

  function shutdown(signal: NodeJS.Signals): void {
    logger.info({ signal }, 'apagando worker');
    clearInterval(keepAlive);
    process.exit(0);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(signal));
  }
}

async function main(): Promise<void> {
  if (!env.NOTIFICATIONS_ENABLED) {
    runIdle();
    return;
  }

  if (env.MONGODB_URI === undefined || env.REDIS_URL === undefined) {
    throw new Error('Falta MONGODB_URI o REDIS_URL para procesar notificaciones.');
  }

  await connectDatabase(env.MONGODB_URI);

  const provider = createNotificationProvider();
  const processNotification = createNotificationProcessor({
    jobs: notificationJobRepository,
    provider,
    logger,
    now: () => new Date(),
  });

  const worker = new Worker<NotificationJobData>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job) => {
      await processNotification(job.data, {
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts ?? 1,
      });
    },
    {
      connection: redisConnectionOptions(env.REDIS_URL),
      concurrency: env.NOTIFICATION_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'trabajo de notificación completado');
  });

  worker.on('failed', (job, error: unknown) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err: error },
      'trabajo de notificación fallido',
    );
  });

  worker.on('error', (error: unknown) => {
    logger.error({ err: error }, 'error del worker de notificaciones');
  });

  const queue = createNotificationQueue(env.REDIS_URL, logger);
  const reconcile = createNotificationReconciler({
    jobs: notificationRequeueRepository,
    queue,
    logger,
    now: () => new Date(),
    staleAfterMs: STALE_PENDING_AGE_MS,
    batchSize: RECONCILE_BATCH_SIZE,
    maxBatches: RECONCILE_MAX_BATCHES,
  });
  const scheduler = startReconcileScheduler({
    reconcile,
    logger,
    intervalMs: RECONCILE_INTERVAL_MS,
  });

  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'apagando worker de notificaciones');

    const forceExit = setTimeout(() => {
      logger.error('cierre forzado por tiempo agotado');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      scheduler.stop();
      await worker.close();
      await queue.close();
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error al cerrar el worker');
      process.exit(1);
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  logger.info(
    { concurrency: env.NOTIFICATION_CONCURRENCY, provider: env.WHATSAPP_PROVIDER },
    'worker de notificaciones iniciado',
  );
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'promesa rechazada sin manejar');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'excepción no capturada');
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.error({ err: error }, 'no se pudo iniciar el worker');
  process.exit(1);
});
