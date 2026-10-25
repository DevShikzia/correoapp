import { describe, expect, it } from 'vitest';
import { createNotificationService } from '../src/modules/notifications/notification.service.js';
import type {
  MailNotificationInput,
  NotificationQueue,
} from '../src/modules/notifications/notification.service.js';
import { createNotificationRepositoryFake } from './fakes.js';

const INPUT: MailNotificationInput = {
  mailItemId: 'mail-1',
  lotId: 'lot-1',
  lotNumber: '42',
  contacts: [
    { name: 'Ana', phone: '+5491100000001' },
    { name: 'Beto', phone: '+5491100000002' },
    { name: 'Ana repetida', phone: '+5491100000001' },
  ],
};

const silentLogger = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

function buildService(options: { enabled?: boolean; queue?: NotificationQueue } = {}) {
  const jobs = createNotificationRepositoryFake();
  const enqueued: string[] = [];
  const queue: NotificationQueue = options.queue ?? {
    async enqueue(notificationId: string): Promise<void> {
      enqueued.push(notificationId);
    },
  };

  const service = createNotificationService({
    jobs,
    queue,
    logger: silentLogger,
    enabled: options.enabled ?? true,
  });

  return { service, jobs, enqueued };
}

describe('notificationService.notifyMail', () => {
  it('crea un aviso durable por teléfono único y lo encola', async () => {
    const { service, jobs, enqueued } = buildService();

    await service.notifyMail(INPUT);

    const records = [...jobs.records.values()];
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.phone).sort()).toEqual([
      '+5491100000001',
      '+5491100000002',
    ]);
    expect(records.every((record) => record.status === 'queued')).toBe(true);
    expect(enqueued.sort()).toEqual(records.map((record) => record.id).sort());
  });

  it('no crea avisos si el lote no tiene contactos', async () => {
    const { service, jobs } = buildService();

    await service.notifyMail({ ...INPUT, contacts: [] });

    expect(jobs.records.size).toBe(0);
  });

  it('no hace nada si las notificaciones están deshabilitadas', async () => {
    const { service, jobs, enqueued } = buildService({ enabled: false });

    await service.notifyMail(INPUT);

    expect(jobs.records.size).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it('mantiene el aviso pendiente si la cola no responde', async () => {
    const failingQueue: NotificationQueue = {
      async enqueue(): Promise<void> {
        throw new Error('Redis no disponible');
      },
    };
    const { service, jobs } = buildService({ queue: failingQueue });

    await expect(service.notifyMail(INPUT)).resolves.toBeUndefined();

    const records = [...jobs.records.values()];
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === 'pending')).toBe(true);
  });

  it('no lanza si no se pueden persistir los avisos', async () => {
    const jobs = createNotificationRepositoryFake();
    jobs.createMany = async (): Promise<never> => {
      throw new Error('Mongo no disponible');
    };
    const service = createNotificationService({
      jobs,
      queue: { async enqueue(): Promise<void> {} },
      logger: silentLogger,
      enabled: true,
    });

    await expect(service.notifyMail(INPUT)).resolves.toBeUndefined();
  });
});
