import { Router, type RequestHandler } from 'express';
import type { NotificationAdminService } from './notification-admin.service.js';
import { createNotificationsController } from './notification.controller.js';

export interface NotificationsRouterDeps {
  service: NotificationAdminService;
  requireAuth: RequestHandler;
}

export function createNotificationsRouter({
  service,
  requireAuth,
}: NotificationsRouterDeps): Router {
  const router = Router();
  const controller = createNotificationsController(service);

  router.use(requireAuth);

  router.get('/', controller.list);
  router.post('/:id/retry', controller.retry);

  return router;
}
