import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdown(server: Server, signal: string): void {
  logger.info({ signal }, 'apagando API');

  server.close((error) => {
    void (async (): Promise<void> => {
      if (error) {
        logger.error({ err: error }, 'error al cerrar el servidor');
        process.exit(1);
      }
      await disconnectDatabase().catch((dbError: unknown) => {
        logger.error({ err: dbError }, 'error al cerrar MongoDB');
      });
      process.exit(0);
    })();
  });

  setTimeout(() => {
    logger.error('cierre forzado por tiempo agotado');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

async function main(): Promise<void> {
  if (env.MONGODB_URI === undefined) {
    logger.warn('MONGODB_URI no configurada: la API arranca sin base de datos');
  } else {
    await connectDatabase(env.MONGODB_URI);
  }

  const server: Server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'API iniciada');
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(server, signal));
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'promesa rechazada sin manejar');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'excepción no capturada');
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.error({ err: error }, 'no se pudo iniciar la API');
  process.exit(1);
});
