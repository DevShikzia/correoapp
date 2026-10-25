import { Router, type RequestHandler } from 'express';
import { createMailController } from './mail.controller.js';
import type { MailService } from './mail.service.js';

export interface MailRouterDeps {
  service: MailService;
  requireAuth: RequestHandler;
}

export function createMailRouter({ service, requireAuth }: MailRouterDeps): Router {
  const router = Router();
  const controller = createMailController(service);

  router.use(requireAuth);

  router.post('/', controller.register);
  router.get('/pending', controller.listPending);
  router.get('/:id', controller.getById);
  router.patch('/:id/deliver', controller.deliver);

  return router;
}
