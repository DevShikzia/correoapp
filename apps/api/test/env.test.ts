import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const BASE = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/correspondencia_test',
} as NodeJS.ProcessEnv;

describe('parseEnv', () => {
  it('trata las variables vacías como no definidas', () => {
    const env = parseEnv({
      ...BASE,
      NOTIFICATIONS_ENABLED: 'false',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_TOKEN: '',
      WHATSAPP_APP_SECRET: '',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: '',
      WHATSAPP_TEMPLATE_NAME: '',
    });

    expect(env.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
    expect(env.WHATSAPP_TOKEN).toBeUndefined();
    expect(env.WHATSAPP_PROVIDER).toBe('disabled');
  });

  it('rechaza habilitar notificaciones con el proveedor deshabilitado', () => {
    expect(() =>
      parseEnv({
        ...BASE,
        NOTIFICATIONS_ENABLED: 'true',
        REDIS_URL: 'redis://127.0.0.1:6379',
        WHATSAPP_PROVIDER: 'disabled',
      }),
    ).toThrow(/WHATSAPP_PROVIDER/);
  });

  it('exige las credenciales de Meta cuando se habilita', () => {
    expect(() =>
      parseEnv({
        ...BASE,
        NOTIFICATIONS_ENABLED: 'true',
        REDIS_URL: 'redis://127.0.0.1:6379',
        WHATSAPP_PROVIDER: 'meta',
      }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  it('exige MONGODB_URI en producción', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a'.repeat(32),
        APP_ORIGIN: 'https://example.test',
      }),
    ).toThrow(/MONGODB_URI/);
  });
});
