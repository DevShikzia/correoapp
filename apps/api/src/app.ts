import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { noStore } from './middleware/no-store.js';
import { healthRouter } from './routes/health.routes.js';

const JSON_BODY_LIMIT = '100kb';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', noStore);
  app.use('/api/health', healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
