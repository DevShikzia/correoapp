import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const BASE = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/correspondencia_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
} as NodeJS.ProcessEnv;

describe('parseEnv del worker', () => {
  it('trata las variables vacías como no definidas', () => {
    const env = parseEnv({
      ...BASE,
      NOTIFICATIONS_ENABLED: 'false',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_TOKEN: '',
      WHATSAPP_TEMPLATE_NAME: '',
    });

    expect(env.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
    expect(env.WHATSAPP_TOKEN).toBeUndefined();
    expect(env.NOTIFICATIONS_ENABLED).toBe(false);
  });

  it('exige las credenciales de Meta cuando se habilita', () => {
    expect(() =>
      parseEnv({
        ...BASE,
        NOTIFICATIONS_ENABLED: 'true',
        WHATSAPP_PROVIDER: 'meta',
      }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });
});
