import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SESSION_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuración inválida:\n${details.join('\n')}`);
  }

  if (result.data.NODE_ENV === 'production' && result.data.SESSION_SECRET === undefined) {
    throw new Error('Configuración inválida: SESSION_SECRET es obligatorio en producción.');
  }

  return result.data;
}

export const env = readEnv();
