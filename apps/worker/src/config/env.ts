import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const BOOLEAN_VALUES = ['true', 'false'] as const;
const WHATSAPP_PROVIDERS = ['disabled', 'console', 'meta'] as const;

const NOTIFICATION_CONCURRENCY_DEFAULT = 5;
const NOTIFICATION_MAX_ATTEMPTS_DEFAULT = 5;
const NOTIFICATION_BACKOFF_MS_DEFAULT = 30_000;
const WHATSAPP_API_URL_DEFAULT = 'https://graph.facebook.com/v23.0';
const WHATSAPP_TEMPLATE_LANGUAGE_DEFAULT = 'es_AR';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  MONGODB_URI: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  NOTIFICATIONS_ENABLED: z
    .enum(BOOLEAN_VALUES)
    .default('false')
    .transform((value) => value === 'true'),
  NOTIFICATION_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(NOTIFICATION_CONCURRENCY_DEFAULT),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(NOTIFICATION_MAX_ATTEMPTS_DEFAULT),
  NOTIFICATION_BACKOFF_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(NOTIFICATION_BACKOFF_MS_DEFAULT),
  WHATSAPP_PROVIDER: z.enum(WHATSAPP_PROVIDERS).default('disabled'),
  WHATSAPP_API_URL: z.url().default(WHATSAPP_API_URL_DEFAULT),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_TOKEN: z.string().min(1).optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().min(1).max(64).optional(),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(2).max(10).default(WHATSAPP_TEMPLATE_LANGUAGE_DEFAULT),
});

export type Env = z.infer<typeof envSchema>;

function validateNotificationConfig(config: Env): void {
  const problems: string[] = [];

  if (!config.NOTIFICATIONS_ENABLED) {
    return;
  }

  if (config.MONGODB_URI === undefined) {
    problems.push('MONGODB_URI es obligatorio cuando NOTIFICATIONS_ENABLED=true');
  }

  if (config.REDIS_URL === undefined) {
    problems.push('REDIS_URL es obligatorio cuando NOTIFICATIONS_ENABLED=true');
  }

  if (config.WHATSAPP_PROVIDER === 'disabled') {
    problems.push('WHATSAPP_PROVIDER debe ser console o meta cuando NOTIFICATIONS_ENABLED=true');
  }

  if (config.WHATSAPP_PROVIDER === 'meta') {
    const requiredVariables = [
      ['WHATSAPP_PHONE_NUMBER_ID', config.WHATSAPP_PHONE_NUMBER_ID],
      ['WHATSAPP_TOKEN', config.WHATSAPP_TOKEN],
      ['WHATSAPP_TEMPLATE_NAME', config.WHATSAPP_TEMPLATE_NAME],
    ] as const;

    for (const [name, value] of requiredVariables) {
      if (value === undefined) {
        problems.push(`${name} es obligatorio cuando WHATSAPP_PROVIDER=meta`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
}

function readEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuración inválida:\n${details.join('\n')}`);
  }

  if (result.data.NODE_ENV === 'production' && result.data.MONGODB_URI === undefined) {
    throw new Error('Configuración inválida: MONGODB_URI es obligatorio en producción.');
  }

  validateNotificationConfig(result.data);

  return result.data;
}

export const env = readEnv();
