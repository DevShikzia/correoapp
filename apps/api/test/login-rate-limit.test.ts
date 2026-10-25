import { describe, expect, it } from 'vitest';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';

const ONE_MINUTE_MS = 60_000;

describe('createAttemptLimiter', () => {
  it('bloquea una clave al alcanzar el máximo de intentos', () => {
    const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: ONE_MINUTE_MS });

    limiter.registerFailure('usuario');
    limiter.registerFailure('usuario');

    expect(limiter.isBlocked('usuario')).toBe(false);

    limiter.registerFailure('usuario');

    expect(limiter.isBlocked('usuario')).toBe(true);
  });

  it('separa los intentos por clave', () => {
    const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: ONE_MINUTE_MS });

    limiter.registerFailure('usuario-a');

    expect(limiter.isBlocked('usuario-a')).toBe(true);
    expect(limiter.isBlocked('usuario-b')).toBe(false);
  });

  it('vuelve a permitir intentos cuando vence la ventana', () => {
    let currentTime = new Date('2026-03-01T12:00:00.000Z');
    const limiter = createAttemptLimiter({
      maxAttempts: 1,
      windowMs: ONE_MINUTE_MS,
      now: () => currentTime,
    });

    limiter.registerFailure('usuario');
    expect(limiter.isBlocked('usuario')).toBe(true);

    currentTime = new Date(currentTime.getTime() + ONE_MINUTE_MS);

    expect(limiter.isBlocked('usuario')).toBe(false);
  });

  it('reinicia los intentos de una clave', () => {
    const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: ONE_MINUTE_MS });

    limiter.registerFailure('usuario');
    limiter.reset('usuario');

    expect(limiter.isBlocked('usuario')).toBe(false);
  });

  it('mantiene acotada la cantidad de claves en memoria', () => {
    const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: ONE_MINUTE_MS });

    for (let index = 0; index < 1_500; index += 1) {
      limiter.registerFailure(`clave-${index}`);
    }

    limiter.registerFailure('clave-nueva');
    limiter.registerFailure('clave-nueva');

    expect(limiter.isBlocked('clave-nueva')).toBe(true);
  });
});
