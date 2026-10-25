import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import type { NotificationRepository } from './notification.repository.js';
import type { NotificationLogger } from './notification.service.js';

const SIGNATURE_PREFIX = 'sha256=';
const MAX_ERROR_CODE_LENGTH = 64;
const INVALID_SIGNATURE_MESSAGE = 'Firma inválida.';
const INVALID_PAYLOAD_MESSAGE = 'El cuerpo de la petición no es válido.';

const providerStatusSchema = z.enum(['sent', 'delivered', 'read', 'failed']);

const statusEntrySchema = z
  .object({
    id: z.string().min(1).max(128),
    status: providerStatusSchema,
    errors: z
      .array(
        z
          .object({
            code: z.union([z.string(), z.number()]).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const webhookPayloadSchema = z
  .object({
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(
                z
                  .object({
                    value: z
                      .object({
                        statuses: z.array(statusEntrySchema).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export interface ChallengeInput {
  mode: string;
  token: string;
  challenge: string;
}

export interface WebhookResult {
  processed: number;
  updated: number;
}

export interface WhatsappWebhookService {
  verifyChallenge(input: ChallengeInput): string | null;
  handleEvent(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult>;
}

export interface WhatsappWebhookDeps {
  appSecret: string | undefined;
  verifyToken: string | undefined;
  jobs: NotificationRepository;
  logger: NotificationLogger;
}

function safeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function verifySignature(rawBody: Buffer, signature: string | undefined, appSecret: string): void {
  if (signature === undefined || !signature.startsWith(SIGNATURE_PREFIX)) {
    throw new AppError(401, 'UNAUTHORIZED', INVALID_SIGNATURE_MESSAGE);
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const provided = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), 'hex');

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new AppError(401, 'UNAUTHORIZED', INVALID_SIGNATURE_MESSAGE);
  }
}

function readErrorCode(errors: { code?: string | number }[] | undefined): string | null {
  const code = errors?.[0]?.code;

  if (code === undefined) {
    return null;
  }

  return String(code).slice(0, MAX_ERROR_CODE_LENGTH);
}

export function createWhatsappWebhookService(deps: WhatsappWebhookDeps): WhatsappWebhookService {
  return {
    verifyChallenge({ mode, token, challenge }: ChallengeInput): string | null {
      if (deps.verifyToken === undefined || mode !== 'subscribe') {
        return null;
      }

      return safeEqual(token, deps.verifyToken) ? challenge : null;
    },

    async handleEvent(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
      if (deps.appSecret === undefined) {
        throw new AppError(401, 'UNAUTHORIZED', INVALID_SIGNATURE_MESSAGE);
      }

      verifySignature(rawBody, signature, deps.appSecret);

      let payload: z.infer<typeof webhookPayloadSchema>;

      try {
        payload = webhookPayloadSchema.parse(JSON.parse(rawBody.toString('utf8')));
      } catch {
        throw new AppError(400, 'VALIDATION_ERROR', INVALID_PAYLOAD_MESSAGE);
      }

      let processed = 0;
      let updated = 0;

      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const statusEntry of change.value.statuses ?? []) {
            processed += 1;

            const isFailure = statusEntry.status === 'failed';
            const errorCode = isFailure
              ? (readErrorCode(statusEntry.errors) ?? 'PROVIDER_FAILED')
              : null;

            updated += await deps.jobs.applyProviderStatus(
              statusEntry.id,
              isFailure ? 'failed' : 'sent',
              statusEntry.status,
              errorCode,
            );
          }
        }
      }

      deps.logger.info({ processed, updated }, 'estados de WhatsApp procesados');

      return { processed, updated };
    },
  };
}
