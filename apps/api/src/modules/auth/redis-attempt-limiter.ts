import { Redis } from 'ioredis';
import type { AttemptLimiter, AttemptLimiterOptions } from './login-rate-limit.js';
import { createAttemptLimiter } from './login-rate-limit.js';

const REDIS_CONNECT_TIMEOUT_MS = 2_000;

// Incremento y vencimiento en una sola operación: si el proceso cae entre ambos,
// la clave no queda bloqueada para siempre.
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export interface RateLimitLogger {
  warn(data: Record<string, unknown>, message: string): void;
}

export interface RedisRateLimitClient {
  status: string;
  eval(script: string, numberOfKeys: number, key: string, windowMs: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}

export interface RedisAttemptLimiterOptions extends AttemptLimiterOptions {
  client: RedisRateLimitClient;
  keyPrefix: string;
  logger: RateLimitLogger;
  fallback?: AttemptLimiter;
}

export interface RedisAttemptLimiterConfig extends Omit<AttemptLimiterOptions, 'now'> {
  redisUrl: string;
  keyPrefix: string;
  logger: RateLimitLogger;
}

function redisKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

/**
 * Limitador compartido entre instancias. Si Redis no está listo o una operación
 * falla, usa un limitador local para no bloquear el acceso y avisa una sola vez
 * por caída. El respaldo local recibe los mismos fallos para que una caída breve
 * no habilite intentos extra.
 */
export function createRedisAttemptLimiterFromClient({
  client,
  keyPrefix,
  logger,
  fallback,
  ...options
}: RedisAttemptLimiterOptions): AttemptLimiter {
  const local = fallback ?? createAttemptLimiter(options);
  let degraded = false;

  function markDegraded(error: unknown): void {
    if (degraded) {
      return;
    }

    degraded = true;
    logger.warn({ err: error }, 'rate limit: Redis no disponible; se usa el límite local');
  }

  async function readFromRedis(key: string): Promise<boolean> {
    const raw = await client.get(redisKey(keyPrefix, key));
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(count) && count >= options.maxAttempts;
  }

  async function incrementInRedis(key: string): Promise<void> {
    await client.eval(INCREMENT_SCRIPT, 1, redisKey(keyPrefix, key), options.windowMs);
  }

  return {
    async isBlocked(key: string): Promise<boolean> {
      if (client.status !== 'ready') {
        markDegraded(new Error(`estado de Redis: ${client.status}`));
        return local.isBlocked(key);
      }

      try {
        const blocked = await readFromRedis(key);
        degraded = false;
        return blocked;
      } catch (error) {
        markDegraded(error);
        return local.isBlocked(key);
      }
    },

    async registerFailure(key: string): Promise<void> {
      if (client.status !== 'ready') {
        markDegraded(new Error(`estado de Redis: ${client.status}`));
        await local.registerFailure(key);
        return;
      }

      try {
        await incrementInRedis(key);
        degraded = false;
      } catch (error) {
        markDegraded(error);
        await local.registerFailure(key);
        return;
      }

      await local.registerFailure(key);
    },

    async reset(key: string): Promise<void> {
      await local.reset(key);

      if (client.status !== 'ready') {
        markDegraded(new Error(`estado de Redis: ${client.status}`));
        return;
      }

      try {
        await client.del(redisKey(keyPrefix, key));
        degraded = false;
      } catch (error) {
        markDegraded(error);
      }
    },
  };
}

export function createRedisAttemptLimiter({
  redisUrl,
  keyPrefix,
  logger,
  ...options
}: RedisAttemptLimiterConfig): AttemptLimiter {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  });

  // Sin listener, ioredis propaga el error como excepción no capturada.
  client.on('error', () => undefined);

  return createRedisAttemptLimiterFromClient({
    client,
    keyPrefix,
    logger,
    ...options,
  });
}
