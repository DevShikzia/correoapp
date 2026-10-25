import { UnrecoverableError } from 'bullmq';
import type { NotificationJobRepository } from './notification.repository.js';
import { NotificationProviderError, type NotificationProvider } from './provider.js';

export interface NotificationJobData {
  notificationId: string;
}

export interface ProcessingAttempt {
  attemptsMade: number;
  attempts: number;
}

export interface ProcessorLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

export interface NotificationProcessorDeps {
  jobs: NotificationJobRepository;
  provider: NotificationProvider;
  logger: ProcessorLogger;
  now: () => Date;
}

const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';

export function createNotificationProcessor(deps: NotificationProcessorDeps) {
  return async function processNotification(
    data: NotificationJobData,
    attempt: ProcessingAttempt,
  ): Promise<void> {
    const notification = await deps.jobs.findById(data.notificationId);

    if (notification === null) {
      deps.logger.warn({ notificationId: data.notificationId }, 'aviso inexistente');
      return;
    }

    // Idempotencia: un trabajo repetido nunca reenvía un aviso ya confirmado.
    if (notification.status === 'sent' || notification.status === 'failed') {
      deps.logger.info(
        { notificationId: notification.id, status: notification.status },
        'aviso ya finalizado; no se reenvía',
      );
      return;
    }

    const currentAttempt = attempt.attemptsMade + 1;
    await deps.jobs.markSending(notification.id, currentAttempt);

    try {
      const result = await deps.provider.send({
        phone: notification.phone,
        lotNumber: notification.lotNumber,
      });

      await deps.jobs.markSent(notification.id, result.messageId, deps.now());
      deps.logger.info(
        { notificationId: notification.id, attempt: currentAttempt },
        'notificación enviada',
      );
    } catch (error) {
      const providerError = error instanceof NotificationProviderError ? error : null;
      const code = providerError?.code ?? UNKNOWN_ERROR_CODE;
      const retryable = providerError?.retryable ?? true;
      const isLastAttempt = currentAttempt >= attempt.attempts;

      if (!retryable || isLastAttempt) {
        await deps.jobs.markFailed(notification.id, code);
        deps.logger.error(
          { notificationId: notification.id, attempt: currentAttempt, code },
          'notificación falló definitivamente',
        );

        if (!retryable) {
          throw new UnrecoverableError(code);
        }

        throw error;
      }

      await deps.jobs.markRetry(notification.id, code);
      deps.logger.warn(
        { notificationId: notification.id, attempt: currentAttempt, code },
        'se reintentará la notificación',
      );

      throw error;
    }
  };
}
