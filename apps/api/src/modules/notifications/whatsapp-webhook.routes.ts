import express, { Router } from 'express';
import { createWhatsappWebhookController } from './whatsapp-webhook.controller.js';
import type { WhatsappWebhookService } from './whatsapp-webhook.service.js';

const WEBHOOK_BODY_LIMIT = '256kb';

export interface WhatsappWebhookRouterDeps {
  service: WhatsappWebhookService;
}

export function createWhatsappWebhookRouter({ service }: WhatsappWebhookRouterDeps): Router {
  const router = Router();
  const controller = createWhatsappWebhookController(service);

  router.get('/', controller.verify);
  router.post(
    '/',
    express.raw({ type: 'application/json', limit: WEBHOOK_BODY_LIMIT }),
    controller.receive,
  );

  return router;
}
