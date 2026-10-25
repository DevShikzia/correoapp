import { Router, type RequestHandler } from 'express';
import { createLotsController } from './lots.controller.js';
import type { LotsService } from './lots.service.js';

export interface LotsRouterDeps {
  service: LotsService;
  requireAuth: RequestHandler;
}

export function createLotsRouter({ service, requireAuth }: LotsRouterDeps): Router {
  const router = Router();
  const controller = createLotsController(service);

  router.use(requireAuth);

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.post('/:id/reset-pin', controller.resetPin);

  return router;
}
