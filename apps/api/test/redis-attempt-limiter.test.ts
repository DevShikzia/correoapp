import { describe, expect, it } from 'vitest';
import type { RedisRateLimitClient } from '../src/modules/auth/redis-attempt-limiter.js';
import { createRedisAttemptLimiterFromClient } from '../src/modules/auth/redis-attempt-limiter.js';

const WINDOW_MS = 15 * 60 * 1000;

interface FakeClientOptions {
  status?: string;
  fail?: boolean;
}

function createFakeClient({ status = 'ready', fail = false }: FakeClientOptions = {}) {
  const state = { status, fail };
  const counts = new Map<string, number>();
  const windows = new Map<string, number>();

  const client: RedisRateLimitClient = {
    get status(): string {
      return state.status;
    },
    async eval(_script, _numberOfKeys, key, windowMs) {
      if (state.fail) {
        throw new Error('Redis no disponible');
      }

      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);

      if (!windows.has(key)) {
        windows.set(key, windowMs);
      }

      return count;
    },
    async get(key) {
      if (state.fail) {
        throw new Error('Redis no disponible');
      }

      const count = counts.get(key);
      return count === undefined ? null : String(count);
    },
    async del(key) {
      if (state.fail) {
        throw new Error('Redis no disponible');
      }

      counts.delete(key);
      windows.delete(key);
      return 1;
    },
    on() {
      return client;
    },
  };

  return {
    client,
    counts,
    windows,
    setStatus(next: string): void {
      state.status = next;
    },
    setFail(next: boolean): void {
      state.fail = next;
    },
  };
}

function buildLimiter(
  fake: ReturnType<typeof createFakeClient>,
  overrides: { maxAttempts?: number; keyPrefix?: string } = {},
) {
  const warnings: string[] = [];

  const limiter = createRedisAttemptLimiterFromClient({
    client: fake.client,
    keyPrefix: overrides.keyPrefix ?? 'ratelimit:staff',
    maxAttempts: overrides.maxAttempts ?? 3,
    windowMs: WINDOW_MS,
    logger: {
      warn: (_data: Record<string, unknown>, message: string): void => {
        warnings.push(message);
      },
    },
  });

  return { limiter, warnings };
}

describe('createRedisAttemptLimiterFromClient', () => {
  it('incrementa la clave con prefijo y fija la ventana en el primer fallo', async () => {
    const fake = createFakeClient();
    const { limiter } = buildLimiter(fake);

    await limiter.registerFailure('user:admin');

    expect(fake.counts.get('ratelimit:staff:user:admin')).toBe(1);
    expect(fake.windows.get('ratelimit:staff:user:admin')).toBe(WINDOW_MS);
  });

  it('bloquea al alcanzar el máximo de intentos', async () => {
    const fake = createFakeClient();
    const { limiter } = buildLimiter(fake, { maxAttempts: 2 });

    await limiter.registerFailure('user:admin');
    await expect(limiter.isBlocked('user:admin')).resolves.toBe(false);

    await limiter.registerFailure('user:admin');
    await expect(limiter.isBlocked('user:admin')).resolves.toBe(true);
  });

  it('separa las claves y los ámbitos', async () => {
    const fake = createFakeClient();
    const staff = buildLimiter(fake, { maxAttempts: 1, keyPrefix: 'ratelimit:staff' }).limiter;
    const owner = buildLimiter(fake, { maxAttempts: 1, keyPrefix: 'ratelimit:owner' }).limiter;

    await staff.registerFailure('client:203.0.113.10');

    await expect(staff.isBlocked('client:203.0.113.10')).resolves.toBe(true);
    await expect(owner.isBlocked('client:203.0.113.10')).resolves.toBe(false);
  });

  it('limpia el contador compartido al reiniciar', async () => {
    const fake = createFakeClient();
    const { limiter } = buildLimiter(fake, { maxAttempts: 1 });

    await limiter.registerFailure('user:admin');
    await limiter.reset('user:admin');

    await expect(limiter.isBlocked('user:admin')).resolves.toBe(false);
    expect(fake.counts.has('ratelimit:staff:user:admin')).toBe(false);
  });

  it('usa el respaldo local mientras Redis no está listo', async () => {
    const fake = createFakeClient({ status: 'reconnecting' });
    const { limiter, warnings } = buildLimiter(fake, { maxAttempts: 1 });

    await limiter.registerFailure('user:admin');

    await expect(limiter.isBlocked('user:admin')).resolves.toBe(true);
    expect(fake.counts.size).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it('usa el respaldo local si una operación falla', async () => {
    const fake = createFakeClient({ fail: true });
    const { limiter } = buildLimiter(fake, { maxAttempts: 1 });

    await limiter.registerFailure('user:admin');

    await expect(limiter.isBlocked('user:admin')).resolves.toBe(true);
    expect(fake.counts.size).toBe(0);
  });

  it('mantiene el respaldo local al día para una caída posterior', async () => {
    const fake = createFakeClient();
    const { limiter } = buildLimiter(fake, { maxAttempts: 2 });

    await limiter.registerFailure('user:admin');
    await limiter.registerFailure('user:admin');

    fake.setStatus('close');

    await expect(limiter.isBlocked('user:admin')).resolves.toBe(true);
  });

  it('no repite el aviso mientras sigue degradado', async () => {
    const fake = createFakeClient({ fail: true });
    const { limiter, warnings } = buildLimiter(fake, { maxAttempts: 5 });

    await limiter.registerFailure('user:admin');
    await limiter.registerFailure('user:admin');
    await limiter.isBlocked('user:admin');

    expect(warnings).toHaveLength(1);
  });

  it('vuelve a usar Redis cuando se recupera', async () => {
    const fake = createFakeClient({ fail: true });
    const { limiter } = buildLimiter(fake, { maxAttempts: 2 });

    await limiter.registerFailure('user:admin');
    expect(fake.counts.size).toBe(0);

    fake.setFail(false);
    await limiter.registerFailure('user:admin');

    expect(fake.counts.get('ratelimit:staff:user:admin')).toBe(1);
  });
});
