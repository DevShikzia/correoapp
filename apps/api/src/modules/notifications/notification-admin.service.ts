import type { Actor } from '../../shared/actor.js';
import { assertAdmin } from '../../shared/authorization.js';
import { AppError } from '../../shared/errors.js';
import type { Paginated } from '../../shared/pagination.js';
import type { AuditRepository } from '../audit/audit.repository.js';
import type {
  NotificationJobRecord,
  NotificationListQuery,
  NotificationRepository,
} from './notification.repository.js';
import type { NotificationLogger, NotificationQueue } from './notification.service.js';
import type { NotificationStatus } from './notification-job.model.js';
import { maskPhone } from './phone-mask.js';

const DISABLED_MESSAGE = 'Las notificaciones están deshabilitadas.';
const NOT_FOUND_MESSAGE = 'El aviso no existe.';
const ALREADY_SENT_MESSAGE = 'El aviso ya fue enviado.';
const IN_FLIGHT_MESSAGE = 'El aviso está en proceso; esperá a que termine antes de reintentar.';
const QUEUE_UNAVAILABLE_MESSAGE =
  'La cola de notificaciones no está disponible. El aviso quedó pendiente.';

export interface NotificationDto {
  id: string;
  mailItemId: string;
  lotNumber: string;
  phoneMasked: string;
  status: NotificationStatus;
  attempts: number;
  retryCount: number;
  providerStatus: string | null;
  lastErrorCode: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationAdminServiceDeps {
  jobs: NotificationRepository;
  queue: NotificationQueue;
  audit: AuditRepository;
  logger: NotificationLogger;
  enabled: boolean;
}

export function toNotificationDto(record: NotificationJobRecord): NotificationDto {
  return {
    id: record.id,
    mailItemId: record.mailItemId,
    lotNumber: record.lotNumber,
    phoneMasked: maskPhone(record.phone),
    status: record.status,
    attempts: record.attempts,
    retryCount: record.retryCount,
    providerStatus: record.providerStatus,
    lastErrorCode: record.lastErrorCode,
    sentAt: record.sentAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function assertRetryable(record: NotificationJobRecord): void {
  if (record.status === 'sent') {
    throw new AppError(409, 'CONFLICT', ALREADY_SENT_MESSAGE);
  }

  if (record.status === 'queued' || record.status === 'sending') {
    throw new AppError(409, 'CONFLICT', IN_FLIGHT_MESSAGE);
  }
}

export function createNotificationAdminService(deps: NotificationAdminServiceDeps) {
  return {
    async list(actor: Actor, query: NotificationListQuery): Promise<Paginated<NotificationDto>> {
      assertAdmin(actor);

      const result = await deps.jobs.list(query);
      return { ...result, items: result.items.map(toNotificationDto) };
    },

    async retry(actor: Actor, id: string, requestId?: string): Promise<NotificationDto> {
      assertAdmin(actor);

      if (!deps.enabled) {
        throw new AppError(409, 'CONFLICT', DISABLED_MESSAGE);
      }

      const current = await deps.jobs.findById(id);

      if (current === null) {
        throw new AppError(404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
      }

      assertRetryable(current);

      const reset = await deps.jobs.resetForRetry(id);

      if (reset === null) {
        // Otro reintento ganó la carrera entre la lectura y la escritura.
        throw new AppError(409, 'CONFLICT', IN_FLIGHT_MESSAGE);
      }

      try {
        await deps.queue.enqueue(reset.id, reset.retryCount);
      } catch (error) {
        await deps.jobs.revertToPending(reset.id).catch((revertError: unknown) => {
          deps.logger.error(
            { err: revertError, notificationId: reset.id },
            'no se pudo devolver el aviso a pendiente',
          );
        });

        deps.logger.warn({ err: error, notificationId: reset.id }, 'no se pudo reencolar el aviso');

        throw new AppError(503, 'SERVICE_UNAVAILABLE', QUEUE_UNAVAILABLE_MESSAGE);
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'notification.retried',
        entityType: 'notification',
        entityId: reset.id,
        lotId: reset.lotId,
        requestId,
      });

      return toNotificationDto(reset);
    },
  };
}

export type NotificationAdminService = ReturnType<typeof createNotificationAdminService>;
