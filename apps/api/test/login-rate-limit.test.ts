import { describe, expect, it } from 'vitest';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';

const ONE_MINUTE_MS = 60_000;

describe('createAttemptLimiter', () => {
  it('bloquea una clave al alcanzar el máximo de intentos', async () => {
    const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: ONE_MINUTE_MS });

    await limiter.registerFailure('usuario');
    await limiter.registerFailure('usuario');

    await expect(limiter.isBlocked('usuario')).resolves.toBe(false);

    await limiter.registerFailure('usuario');

    await expect(limiter.isBlocked('usuario')).resolves.toBe(true);
  });

  it('separa los intentos por clave', async () => {
    const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: ONE_MINUTE_MS });

    await limiter.registerFailure('usuario-a');

    await expect(limiter.isBlocked('usuario-a')).resolves.toBe(true);
    await expect(limiter.isBlocked('usuario-b')).resolves.toBe(false);
  });

  it('vuelve a permitir intentos cuando vence la ventana', async () => {
    let currentTime = new Date('2026-03-01T12:00:00.000Z');
    const limiter = createAttemptLimiter({
      maxAttempts: 1,
      windowMs: ONE_MINUTE_MS,
      now: () => currentTime,
    });

    await limiter.registerFailure('usuario');
    await expect(limiter.isBlocked('usuario')).resolves.toBe(true);

    currentTime = new Date(currentTime.getTime() + ONE_MINUTE_MS);

    await expect(limiter.isBlocked('usuario')).resolves.toBe(false);
  });

  it('reinicia los intentos de una clave', async () => {
    const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: ONE_MINUTE_MS });

    await limiter.registerFailure('usuario');
    await limiter.reset('usuario');

    await expect(limiter.isBlocked('usuario')).resolves.toBe(false);
  });

  it('mantiene acotada la cantidad de claves en memoria', async () => {
    const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: ONE_MINUTE_MS });

    for (let index = 0; index < 1_500; index += 1) {
      await limiter.registerFailure(`clave-${index}`);
    }

    await limiter.registerFailure('clave-nueva');
    await limiter.registerFailure('clave-nueva');

    await expect(limiter.isBlocked('clave-nueva')).resolves.toBe(true);
  });
});
