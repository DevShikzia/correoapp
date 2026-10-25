import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { WhatsappWebhookService } from './whatsapp-webhook.service.js';

const challengeQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().max(256),
});

const INVALID_BODY_MESSAGE = 'El cuerpo de la petición no es válido.';

export function createWhatsappWebhookController(service: WhatsappWebhookService) {
  return {
    async verify(request: Request, response: Response): Promise<void> {
      const query = parseOrThrow(challengeQuerySchema, request.query);

      const challenge = service.verifyChallenge({
        mode: query['hub.mode'],
        token: query['hub.verify_token'],
        challenge: query['hub.challenge'],
      });

      if (challenge === null) {
        throw new AppError(403, 'FORBIDDEN', 'Verificación fallida.');
      }

      response.status(200).type('text/plain').send(challenge);
    },

    async receive(request: Request, response: Response): Promise<void> {
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', INVALID_BODY_MESSAGE);
      }

      await service.handleEvent(request.body, request.get('x-hub-signature-256'));
      response.status(200).json({ received: true });
    },
  };
}
