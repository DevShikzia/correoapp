import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import type {
  NotificationJobRepository,
  WorkerNotificationJobRecord,
} from '../src/notifications/notification.repository.js';
import { createNotificationProcessor } from '../src/notifications/process-notification.js';
import {
  NotificationProviderError,
  type NotificationMessage,
  type NotificationProvider,
} from '../src/notifications/provider.js';

const NOW = new Date('2026-05-10T15:00:00.000Z');

const silentLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

function buildJob(
  overrides: Partial<WorkerNotificationJobRecord> = {},
): WorkerNotificationJobRecord {
  return {
    id: 'notification-1',
    lotNumber: '42',
    phone: '+5491122334455',
    status: 'queued',
    attempts: 0,
    providerMessageId: null,
    ...overrides,
  };
}

function createJobRepositoryFake(job: WorkerNotificationJobRecord) {
  const state = { job: { ...job } };

  const repository: NotificationJobRepository = {
    async findById(id: string): Promise<WorkerNotificationJobRecord | null> {
      return id === state.job.id ? state.job : null;
    },
    async markSending(_id: string, attempt: number): Promise<void> {
      state.job = { ...state.job, status: 'sending', attempts: attempt };
    },
    async markSent(_id: string, providerMessageId: string, _sentAt: Date): Promise<void> {
      state.job = { ...state.job, status: 'sent', providerMessageId };
    },
    async markRetry(_id: string, _errorCode: string): Promise<void> {
      state.job = { ...state.job, status: 'queued' };
    },
    async markFailed(_id: string, _errorCode: string): Promise<void> {
      state.job = { ...state.job, status: 'failed' };
    },
  };

  return { repository, state };
}

function createProvider(result: {
  messageId?: string;
  error?: NotificationProviderError;
}): NotificationProvider {
  return {
    async send(_message: NotificationMessage): Promise<{ messageId: string }> {
      if (result.error !== undefined) {
        throw result.error;
      }

      return { messageId: result.messageId ?? 'wamid.1' };
    },
  };
}

describe('processNotification', () => {
  it('envía el aviso y lo marca como enviado', async () => {
    const { repository, state } = createJobRepositoryFake(buildJob());
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: createProvider({ messageId: 'wamid.abc' }),
      logger: silentLogger,
      now: () => NOW,
    });

    await processor({ notificationId: 'notification-1' }, { attemptsMade: 0, attempts: 3 });

    expect(state.job).toMatchObject({
      status: 'sent',
      providerMessageId: 'wamid.abc',
      attempts: 1,
    });
  });

  it('no reenvía un aviso ya enviado', async () => {
    const { repository } = createJobRepositoryFake(buildJob({ status: 'sent' }));
    let calls = 0;
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: {
        async send(): Promise<{ messageId: string }> {
          calls += 1;
          return { messageId: 'wamid.1' };
        },
      },
      logger: silentLogger,
      now: () => NOW,
    });

    await processor({ notificationId: 'notification-1' }, { attemptsMade: 0, attempts: 3 });

    expect(calls).toBe(0);
  });

  it('deja el aviso para reintento ante un error recuperable', async () => {
    const { repository, state } = createJobRepositoryFake(buildJob());
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: createProvider({
        error: new NotificationProviderError('HTTP_503', true),
      }),
      logger: silentLogger,
      now: () => NOW,
    });

    await expect(
      processor({ notificationId: 'notification-1' }, { attemptsMade: 0, attempts: 3 }),
    ).rejects.toBeInstanceOf(NotificationProviderError);

    expect(state.job.status).toBe('queued');
  });

  it('marca fallido al agotar los intentos', async () => {
    const { repository, state } = createJobRepositoryFake(buildJob());
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: createProvider({
        error: new NotificationProviderError('HTTP_503', true),
      }),
      logger: silentLogger,
      now: () => NOW,
    });

    await expect(
      processor({ notificationId: 'notification-1' }, { attemptsMade: 2, attempts: 3 }),
    ).rejects.toBeInstanceOf(NotificationProviderError);

    expect(state.job.status).toBe('failed');
  });

  it('no reintenta un error definitivo del proveedor', async () => {
    const { repository, state } = createJobRepositoryFake(buildJob());
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: createProvider({
        error: new NotificationProviderError('WHATSAPP_131026', false),
      }),
      logger: silentLogger,
      now: () => NOW,
    });

    await expect(
      processor({ notificationId: 'notification-1' }, { attemptsMade: 0, attempts: 5 }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(state.job.status).toBe('failed');
  });

  it('ignora un aviso inexistente sin lanzar', async () => {
    const { repository } = createJobRepositoryFake(buildJob());
    const processor = createNotificationProcessor({
      jobs: repository,
      provider: createProvider({}),
      logger: silentLogger,
      now: () => NOW,
    });

    await expect(
      processor({ notificationId: 'notification-inexistente' }, { attemptsMade: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
  });
});
