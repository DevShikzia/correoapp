import type { ConnectionOptions } from 'bullmq';

const DEFAULT_REDIS_PORT = 6379;

export function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: url.port.length > 0 ? Number(url.port) : DEFAULT_REDIS_PORT,
    ...(url.username.length > 0 ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password.length > 0 ? { password: decodeURIComponent(url.password) } : {}),
    ...(database !== undefined && Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    // Requisito de BullMQ para conexiones bloqueantes de Worker.
    maxRetriesPerRequest: null,
  };
}
