import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const MAX_SESSION_TTL_MINUTES = 7 * 24 * 60;
const SESSION_TTL_MINUTES_DEFAULT = 8 * 60;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  MONGODB_URI: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  STAFF_SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(MAX_SESSION_TTL_MINUTES)
    .default(SESSION_TTL_MINUTES_DEFAULT),
  APP_ORIGIN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuración inválida:\n${details.join('\n')}`);
  }

  if (result.data.NODE_ENV === 'production') {
    for (const requiredVariable of ['MONGODB_URI', 'SESSION_SECRET', 'APP_ORIGIN'] as const) {
      if (result.data[requiredVariable] === undefined) {
        throw new Error(
          `Configuración inválida: ${requiredVariable} es obligatorio en producción.`,
        );
      }
    }
  }

  return result.data;
}

export const env = readEnv();
