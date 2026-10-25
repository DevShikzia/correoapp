import type { LotContact } from '../lots/lot.model.js';
import type { NotificationRepository } from './notification.repository.js';

export interface MailNotificationInput {
  mailItemId: string;
  lotId: string;
  lotNumber: string;
  contacts: LotContact[];
}

export interface MailNotifier {
  notifyMail(input: MailNotificationInput): Promise<void>;
}

export interface NotificationQueue {
  enqueue(notificationId: string): Promise<void>;
}

export interface NotificationLogger {
  debug(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

export interface NotificationServiceDeps {
  jobs: NotificationRepository;
  queue: NotificationQueue;
  logger: NotificationLogger;
  enabled: boolean;
}

export function createDisabledNotifier(): MailNotifier {
  return {
    async notifyMail(): Promise<void> {
      // Notificaciones deshabilitadas: la correspondencia se registra igual.
    },
  };
}

export function createNotificationService(deps: NotificationServiceDeps): MailNotifier {
  async function notifyMail(input: MailNotificationInput): Promise<void> {
    if (!deps.enabled || input.contacts.length === 0) {
      return;
    }

    const phones = new Set<string>();

    for (const contact of input.contacts) {
      phones.add(contact.phone);
    }

    try {
      const jobs = await deps.jobs.createMany(
        [...phones].map((phone) => ({
          mailItemId: input.mailItemId,
          lotId: input.lotId,
          lotNumber: input.lotNumber,
          phone,
        })),
      );

      for (const job of jobs) {
        if (job.status !== 'pending') {
          continue;
        }

        try {
          await deps.queue.enqueue(job.id);
          await deps.jobs.markQueued(job.id);
        } catch (error) {
          // El aviso queda pendiente en MongoDB; se puede reintentar sin perderlo.
          deps.logger.warn(
            { err: error, notificationId: job.id },
            'no se pudo encolar la notificación',
          );
        }
      }
    } catch (error) {
      // El contrato es no lanzar: el alta de correspondencia ya está persistida.
      deps.logger.error(
        { err: error, mailItemId: input.mailItemId },
        'no se pudieron registrar las notificaciones',
      );
    }
  }

  return { notifyMail };
}
