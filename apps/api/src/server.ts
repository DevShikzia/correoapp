import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server: Server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API iniciada');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'apagando API');

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'error al cerrar el servidor');
      process.exit(1);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('cierre forzado por tiempo agotado');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'promesa rechazada sin manejar');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'excepción no capturada');
  process.exit(1);
});
