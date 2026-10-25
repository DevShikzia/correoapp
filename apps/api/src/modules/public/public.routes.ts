import { Router, type RequestHandler } from 'express';
import type { SessionCookieConfig } from '../auth/auth.middleware.js';
import { createOwnerAuthController } from './owner-auth.controller.js';
import type { OwnerAuthService } from './owner-auth.service.js';
import { createOwnerMailController } from './owner-mail.controller.js';
import type { OwnerMailService } from './owner-mail.service.js';

export interface PublicRouterDeps {
  auth: OwnerAuthService;
  mail: OwnerMailService;
  requireOwnerAuth: RequestHandler;
  cookie: SessionCookieConfig;
}

export function createPublicRouter({
  auth,
  mail,
  requireOwnerAuth,
  cookie,
}: PublicRouterDeps): Router {
  const router = Router();
  const authController = createOwnerAuthController(auth, cookie);
  const mailController = createOwnerMailController(mail);

  router.post('/access', authController.access);
  router.post('/logout', authController.logout);
  router.get('/me', requireOwnerAuth, authController.me);
  router.get('/mail', requireOwnerAuth, mailController.list);

  return router;
}
