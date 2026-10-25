import { Router, type RequestHandler } from 'express';
import { createStaffController } from './staff.controller.js';
import type { StaffService } from './staff.service.js';

export interface StaffRouterDeps {
  service: StaffService;
  requireAuth: RequestHandler;
}

export function createStaffRouter({ service, requireAuth }: StaffRouterDeps): Router {
  const router = Router();
  const controller = createStaffController(service);

  router.use(requireAuth);

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.patch('/:id', controller.update);

  return router;
}
