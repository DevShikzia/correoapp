import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createDefaultDependencies, type AppDependencies } from './dependencies.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { noStore } from './middleware/no-store.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createLotsRouter } from './modules/lots/lots.routes.js';
import { createMailRouter } from './modules/mail/mail.routes.js';
import { createStaffRouter } from './modules/staff/staff.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createOriginGuard } from './shared/origin-guard.js';

const JSON_BODY_LIMIT = '100kb';
const TRUSTED_PROXY_HOPS = 1;

export function createApp(
  dependencies: AppDependencies = createDefaultDependencies(),
): express.Express {
  const app = express();

  app.disable('x-powered-by');

  if (env.NODE_ENV === 'production') {
    // Detrás de Nginx: sin esto `request.ip` sería la IP del proxy y el rate limit
    // por cliente agruparía a todos los usuarios.
    app.set('trust proxy', TRUSTED_PROXY_HOPS);
  }

  app.use(helmet());
  app.use(pinoHttp({ logger }));

  // Antes de parsear el cuerpo: así los errores de JSON inválido también
  // conservan `no-store` y pasan por el guard de origen.
  app.use('/api', noStore);
  app.use('/api', createOriginGuard(dependencies.allowedOrigin));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/health', healthRouter);
  app.use(
    '/api/auth',
    createAuthRouter({
      service: dependencies.auth,
      requireAuth: dependencies.requireStaffAuth,
      cookie: dependencies.cookie,
    }),
  );
  app.use(
    '/api/lots',
    createLotsRouter({
      service: dependencies.lots,
      requireAuth: dependencies.requireStaffAuth,
    }),
  );
  app.use(
    '/api/mail',
    createMailRouter({
      service: dependencies.mail,
      requireAuth: dependencies.requireStaffAuth,
    }),
  );
  app.use(
    '/api/staff',
    createStaffRouter({
      service: dependencies.staff,
      requireAuth: dependencies.requireStaffAuth,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
