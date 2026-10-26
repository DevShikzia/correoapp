import type { RequeueRepository } from './notification.repository.js';
import type { NotificationQueue } from './queue.js';

export interface ReconcileLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

export interface NotificationReconcilerDeps {
  jobs: RequeueRepository;
  queue: NotificationQueue;
  logger: ReconcileLogger;
  now: () => Date;
  staleAfterMs: number;
  batchSize: number;
  maxBatches: number;
}

/**
 * Reencola avisos que quedaron `pending` porque Redis no respondió al
 * registrarlos. Nunca toca `queued` ni `sending`: ahí el mensaje pudo haber
 * salido sin confirmación y reintentar podría duplicarlo.
 */
export function createNotificationReconciler(deps: NotificationReconcilerDeps) {
  return async function reconcile(): Promise<number> {
    const olderThan = new Date(deps.now().getTime() - deps.staleAfterMs);
    let requeued = 0;

    for (let batch = 0; batch < deps.maxBatches; batch += 1) {
      const stale = await deps.jobs.findStalePending(olderThan, deps.batchSize);

      if (stale.length === 0) {
        break;
      }

      let queueFailed = false;

      for (const notification of stale) {
        const claimed = await deps.jobs.claimForRequeue(notification.id, olderThan);

        if (claimed === null) {
          continue;
        }

        try {
          await deps.queue.enqueue(claimed.id, claimed.retryCount);
          requeued += 1;
        } catch (error) {
          queueFailed = true;

          await deps.jobs.releaseToPending(claimed.id).catch((releaseError: unknown) => {
            deps.logger.error(
              { err: releaseError, notificationId: claimed.id },
              'reconciliación: no se pudo devolver el aviso a pendiente',
            );
          });

          deps.logger.warn(
            { err: error, notificationId: claimed.id },
            'reconciliación: no se pudo reencolar el aviso',
          );
        }
      }

      // Si la cola falló, no tiene sentido seguir con el siguiente lote.
      if (queueFailed || stale.length < deps.batchSize) {
        break;
      }
    }

    if (requeued > 0) {
      deps.logger.info({ requeued }, 'avisos pendientes reencolados');
    }

    return requeued;
  };
}
