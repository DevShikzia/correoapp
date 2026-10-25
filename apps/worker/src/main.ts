import { logger } from './config/logger.js';

const KEEP_ALIVE_INTERVAL_MS = 60_000;

logger.info('Worker iniciado; el procesamiento de notificaciones se habilita en la Fase 6');

const keepAlive = setInterval(() => {
  logger.debug('worker a la espera de tareas');
}, KEEP_ALIVE_INTERVAL_MS);

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'apagando worker');
  clearInterval(keepAlive);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(signal));
}
