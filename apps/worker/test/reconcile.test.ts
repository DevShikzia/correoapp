import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RequeuableNotification,
  RequeueRepository,
} from '../src/notifications/notification.repository.js';
import type { NotificationQueue } from '../src/notifications/queue.js';
import { createNotificationReconciler } from '../src/notifications/reconcile.js';
import { startReconcileScheduler } from '../src/notifications/reconcile-scheduler.js';

const NOW = new Date('2026-05-10T15:00:00.000Z');
const STALE_AFTER_MS = 2 * 60 * 1000;
const OLD = new Date(NOW.getTime() - 30 * 60 * 1000);
const RECENT = new Date(NOW.getTime() - 10 * 1000);

const silentLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

interface StoredNotification extends RequeuableNotification {
  status: 'pending' | 'queued' | 'sending' | 'sent' | 'failed';
  createdAt: Date;
}

function createRequeueRepositoryFake(seed: StoredNotification[]) {
  const records = new Map(seed.map((record) => [record.id, { ...record }]));

  const repository: RequeueRepository = {
    async findStalePending(olderThan: Date, limit: number): Promise<RequeuableNotification[]> {
      return [...records.values()]
        .filter((record) => record.status === 'pending' && record.createdAt < olderThan)
        .sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime())
        .slice(0, limit)
        .map((record) => ({ id: record.id, retryCount: record.retryCount }));
    },

    async claimForRequeue(id: string, olderThan: Date): Promise<RequeuableNotification | null> {
      const record = records.get(id);

      if (record === undefined || record.status !== 'pending' || record.createdAt >= olderThan) {
        return null;
      }

      record.status = 'queued';
      return { id: record.id, retryCount: record.retryCount };
    },

    async releaseToPending(id: string): Promise<void> {
      const record = records.get(id);

      if (record !== undefined && record.status === 'queued') {
        record.status = 'pending';
      }
    },
  };

  return { repository, records };
}

function createQueueFake(options: { fail?: boolean } = {}) {
  const enqueued: Array<{ id: string; retryCount: number }> = [];

  const queue: NotificationQueue = {
    async enqueue(notificationId: string, retryCount: number): Promise<void> {
      if (options.fail === true) {
        throw new Error('Redis no disponible');
      }

      enqueued.push({ id: notificationId, retryCount });
    },
    async close(): Promise<void> {},
  };

  return { queue, enqueued };
}

function buildReconciler(
  seed: StoredNotification[],
  options: { failQueue?: boolean; batchSize?: number; maxBatches?: number } = {},
) {
  const { repository, records } = createRequeueRepositoryFake(seed);
  const { queue, enqueued } = createQueueFake({ fail: options.failQueue });

  const reconcile = createNotificationReconciler({
    jobs: repository,
    queue,
    logger: silentLogger,
    now: () => NOW,
    staleAfterMs: STALE_AFTER_MS,
    batchSize: options.batchSize ?? 50,
    maxBatches: options.maxBatches ?? 20,
  });

  return { reconcile, records, enqueued };
}

describe('reconciliación de avisos pendientes', () => {
  it('reencola los avisos pendientes antiguos y los marca en cola', async () => {
    const { reconcile, records, enqueued } = buildReconciler([
      { id: 'n-1', retryCount: 0, status: 'pending', createdAt: OLD },
    ]);

    await expect(reconcile()).resolves.toBe(1);

    expect(enqueued).toEqual([{ id: 'n-1', retryCount: 0 }]);
    expect(records.get('n-1')?.status).toBe('queued');
  });

  it('no toca un aviso pendiente recién creado', async () => {
    const { reconcile, records, enqueued } = buildReconciler([
      { id: 'n-1', retryCount: 0, status: 'pending', createdAt: RECENT },
    ]);

    await expect(reconcile()).resolves.toBe(0);

    expect(enqueued).toHaveLength(0);
    expect(records.get('n-1')?.status).toBe('pending');
  });

  it('nunca reencola avisos en proceso de envío o ya resueltos', async () => {
    const { reconcile, enqueued } = buildReconciler([
      { id: 'n-1', retryCount: 0, status: 'queued', createdAt: OLD },
      { id: 'n-2', retryCount: 0, status: 'sending', createdAt: OLD },
      { id: 'n-3', retryCount: 0, status: 'sent', createdAt: OLD },
      { id: 'n-4', retryCount: 0, status: 'failed', createdAt: OLD },
    ]);

    await expect(reconcile()).resolves.toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it('devuelve el aviso a pendiente si la cola falla', async () => {
    const { reconcile, records, enqueued } = buildReconciler(
      [{ id: 'n-1', retryCount: 0, status: 'pending', createdAt: OLD }],
      { failQueue: true },
    );

    await expect(reconcile()).resolves.toBe(0);
    expect(enqueued).toHaveLength(0);
    expect(records.get('n-1')?.status).toBe('pending');
  });

  it('usa el retryCount del aviso para no repetir el jobId', async () => {
    const { reconcile, enqueued } = buildReconciler([
      { id: 'n-1', retryCount: 2, status: 'pending', createdAt: OLD },
    ]);

    await reconcile();

    expect(enqueued).toEqual([{ id: 'n-1', retryCount: 2 }]);
  });

  it('procesa varios lotes hasta vaciar los pendientes', async () => {
    const seed: StoredNotification[] = ['n-1', 'n-2', 'n-3'].map((id) => ({
      id,
      retryCount: 0,
      status: 'pending' as const,
      createdAt: OLD,
    }));

    const { reconcile, enqueued } = buildReconciler(seed, { batchSize: 2 });

    await expect(reconcile()).resolves.toBe(3);
    expect(enqueued.map((item) => item.id)).toEqual(['n-1', 'n-2', 'n-3']);
  });
});

describe('startReconcileScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ejecuta al arrancar y no solapa dos corridas', async () => {
    vi.useFakeTimers();
    const pendingRuns: Array<() => void> = [];
    let calls = 0;
    const scheduler = startReconcileScheduler({
      intervalMs: 1_000,
      logger: silentLogger,
      reconcile: async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          pendingRuns.push(resolve);
        });
        return 0;
      },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(1);

    pendingRuns[0]?.();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);

    pendingRuns[1]?.();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(2);
  });

  it('no propaga errores de reconciliación', async () => {
    vi.useFakeTimers();
    const warnings: string[] = [];
    const scheduler = startReconcileScheduler({
      intervalMs: 1_000,
      logger: {
        warn: (_data: Record<string, unknown>, message: string): void => {
          warnings.push(message);
        },
      },
      reconcile: async () => {
        throw new Error('fallo simulado');
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(warnings).toEqual(['falló la reconciliación de avisos']);

    scheduler.stop();
  });
});
