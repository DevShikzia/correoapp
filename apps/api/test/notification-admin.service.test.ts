import { describe, expect, it } from 'vitest';
import type { NotificationQueue } from '../src/modules/notifications/notification.service.js';
import { createNotificationAdminService } from '../src/modules/notifications/notification-admin.service.js';
import type { NotificationJobRecord } from '../src/modules/notifications/notification.repository.js';
import { maskPhone } from '../src/modules/notifications/phone-mask.js';
import { createAuditRepositoryFake, createNotificationRepositoryFake } from './fakes.js';

const NOW = new Date('2026-05-10T15:00:00.000Z');
const PHONE = '+5491122334455';
const ADMIN = { id: 'staff-admin', role: 'admin' as const };
const GUARD = { id: 'staff-guard', role: 'guard' as const };

const silentLogger = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

function buildNotification(overrides: Partial<NotificationJobRecord> = {}): NotificationJobRecord {
  return {
    id: 'notification-1',
    mailItemId: 'mail-1',
    lotId: 'lot-42',
    lotNumber: '42',
    phone: PHONE,
    status: 'failed',
    attempts: 3,
    retryCount: 0,
    providerMessageId: null,
    providerStatus: null,
    lastErrorCode: 'HTTP_503',
    sentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildService(
  options: {
    notifications?: NotificationJobRecord[];
    enabled?: boolean;
    queue?: NotificationQueue;
  } = {},
) {
  const jobs = createNotificationRepositoryFake(options.notifications ?? []);
  const audit = createAuditRepositoryFake();
  const enqueued: Array<{ id: string; retryCount: number }> = [];

  const queue: NotificationQueue = options.queue ?? {
    async enqueue(notificationId: string, retryCount: number): Promise<void> {
      enqueued.push({ id: notificationId, retryCount });
    },
  };

  const service = createNotificationAdminService({
    jobs,
    queue,
    audit,
    logger: silentLogger,
    enabled: options.enabled ?? true,
  });

  return { service, jobs, audit, enqueued };
}

describe('notificationAdminService.retry', () => {
  it('reencola un aviso fallido con un jobId nuevo y lo audita', async () => {
    const { service, jobs, audit, enqueued } = buildService({
      notifications: [buildNotification()],
    });

    const result = await service.retry(ADMIN, 'notification-1', 'req-1');

    expect(result).toMatchObject({
      id: 'notification-1',
      status: 'queued',
      attempts: 0,
      retryCount: 1,
      lastErrorCode: null,
    });
    expect(jobs.records.get('notification-1')).toMatchObject({
      status: 'queued',
      retryCount: 1,
    });
    expect(enqueued).toEqual([{ id: 'notification-1', retryCount: 1 }]);
    expect(audit.entries).toEqual([
      {
        actorType: 'staff',
        actorId: 'staff-admin',
        action: 'notification.retried',
        entityType: 'notification',
        entityId: 'notification-1',
        lotId: 'lot-42',
        requestId: 'req-1',
      },
    ]);
  });

  it('permite reintentar un aviso pendiente', async () => {
    const { service, enqueued } = buildService({
      notifications: [buildNotification({ status: 'pending', attempts: 0, lastErrorCode: null })],
    });

    const result = await service.retry(ADMIN, 'notification-1');

    expect(result.status).toBe('queued');
    expect(enqueued).toHaveLength(1);
  });

  it('rechaza un aviso ya enviado', async () => {
    const { service, enqueued } = buildService({
      notifications: [buildNotification({ status: 'sent', sentAt: NOW })],
    });

    await expect(service.retry(ADMIN, 'notification-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'El aviso ya fue enviado.',
    });
    expect(enqueued).toHaveLength(0);
  });

  it('rechaza un aviso en proceso para no duplicar el mensaje', async () => {
    for (const status of ['queued', 'sending'] as const) {
      const { service, enqueued } = buildService({
        notifications: [buildNotification({ status })],
      });

      await expect(service.retry(ADMIN, 'notification-1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
      expect(enqueued).toHaveLength(0);
    }
  });

  it('devuelve 404 si el aviso no existe', async () => {
    const { service } = buildService();

    await expect(service.retry(ADMIN, 'notification-inexistente')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('solo permite reintentar a un administrador', async () => {
    const { service, enqueued } = buildService({ notifications: [buildNotification()] });

    await expect(service.retry(GUARD, 'notification-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(enqueued).toHaveLength(0);
  });

  it('deja el aviso pendiente y responde 503 si la cola falla', async () => {
    const { service, jobs, audit } = buildService({
      notifications: [buildNotification()],
      queue: {
        async enqueue(): Promise<void> {
          throw new Error('Redis no disponible');
        },
      },
    });

    await expect(service.retry(ADMIN, 'notification-1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(jobs.records.get('notification-1')).toMatchObject({
      status: 'pending',
      retryCount: 1,
      lastErrorCode: null,
    });
    expect(audit.entries).toHaveLength(0);
  });

  it('rechaza el reintento si las notificaciones están deshabilitadas', async () => {
    const { service } = buildService({
      notifications: [buildNotification()],
      enabled: false,
    });

    await expect(service.retry(ADMIN, 'notification-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Las notificaciones están deshabilitadas.',
    });
  });
});

describe('notificationAdminService.list', () => {
  it('filtra por estado y no expone el teléfono completo', async () => {
    const { service } = buildService({
      notifications: [
        buildNotification(),
        buildNotification({ id: 'notification-2', status: 'sent', sentAt: NOW }),
      ],
    });

    const failed = await service.list(ADMIN, { status: 'failed', page: 1, limit: 20 });

    expect(failed.total).toBe(1);
    expect(failed.items[0]).toMatchObject({
      id: 'notification-1',
      phoneMasked: '+549••••4455',
    });
    expect(JSON.stringify(failed.items)).not.toContain(PHONE);
    expect(JSON.stringify(failed.items)).not.toContain('phone"');
  });

  it('solo permite listar a un administrador', async () => {
    const { service } = buildService();

    await expect(service.list(GUARD, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('maskPhone', () => {
  it('oculta el centro del número pero conserva prefijo y sufijo', () => {
    expect(maskPhone('+5491122334455')).toBe('+549••••4455');
  });

  it('oculta por completo un teléfono demasiado corto', () => {
    expect(maskPhone('+54911')).toBe('••••••');
  });
});
