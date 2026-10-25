import { Router, type RequestHandler } from 'express';
import { createAuthController } from './auth.controller.js';
import type { SessionCookieConfig } from './auth.middleware.js';
import type { AuthService } from './auth.service.js';

export interface AuthRouterDeps {
  service: AuthService;
  requireAuth: RequestHandler;
  cookie: SessionCookieConfig;
}

export function createAuthRouter({ service, requireAuth, cookie }: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(service, cookie);

  router.post('/login', controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
