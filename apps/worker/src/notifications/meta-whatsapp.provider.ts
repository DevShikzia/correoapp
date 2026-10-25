import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MAX_ERROR_CODE_LENGTH } from './notification.constants.js';
import {
  NotificationProviderError,
  type NotificationMessage,
  type NotificationProvider,
  type ProviderLogger,
  type SendResult,
} from './provider.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429]);
const INVALID_PHONE_CODE = 'INVALID_PHONE';
const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
const TIMEOUT_ERROR_CODE = 'TIMEOUT';
const INVALID_RESPONSE_CODE = 'INVALID_RESPONSE';

const responseSchema = z
  .object({
    messages: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1),
  })
  .passthrough();

const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface MetaWhatsappConfig {
  apiUrl: string;
  phoneNumberId: string;
  token: string;
  templateName: string;
  templateLanguage: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function toRecipient(phone: string): string {
  const digits = phone.startsWith('+') ? phone.slice(1) : phone;

  if (!/^[0-9]{8,15}$/.test(digits)) {
    throw new NotificationProviderError(INVALID_PHONE_CODE, false);
  }

  return digits;
}

function truncateCode(code: string): string {
  return code.slice(0, MAX_ERROR_CODE_LENGTH);
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

async function readErrorCode(response: Response, status: number): Promise<string> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    const code = parsed.success ? parsed.data.error?.code : undefined;

    if (code !== undefined) {
      return truncateCode(`WHATSAPP_${String(code)}`);
    }
  } catch {
    // La respuesta de error no era JSON; se usa el código HTTP.
  }

  return `HTTP_${status}`;
}

export function createMetaWhatsappProvider(
  config: MetaWhatsappConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): NotificationProvider {
  const url = `${config.apiUrl.replace(/\/+$/, '')}/${config.phoneNumberId}/messages`;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async send(message: NotificationMessage): Promise<SendResult> {
      const body = JSON.stringify({
        messaging_product: 'whatsapp',
        to: toRecipient(message.phone),
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: message.lotNumber }],
            },
          ],
        },
      });

      let response: Response;

      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const aborted =
          error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

        throw new NotificationProviderError(
          aborted ? TIMEOUT_ERROR_CODE : NETWORK_ERROR_CODE,
          true,
        );
      }

      if (!response.ok) {
        throw new NotificationProviderError(
          await readErrorCode(response, response.status),
          isRetryableStatus(response.status),
        );
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new NotificationProviderError(INVALID_RESPONSE_CODE, true);
      }

      const parsed = responseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new NotificationProviderError(INVALID_RESPONSE_CODE, true);
      }

      const firstMessage = parsed.data.messages[0];

      if (firstMessage === undefined) {
        throw new NotificationProviderError(INVALID_RESPONSE_CODE, true);
      }

      return { messageId: firstMessage.id };
    },
  };
}

export function createConsoleProvider(logger: ProviderLogger): NotificationProvider {
  return {
    async send(message: NotificationMessage): Promise<SendResult> {
      logger.info(
        { lotNumber: message.lotNumber, provider: 'console' },
        'notificación simulada: no se envió ningún mensaje real',
      );

      return { messageId: `console-${randomUUID()}` };
    },
  };
}
