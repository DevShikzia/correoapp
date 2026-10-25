import { describe, expect, it } from 'vitest';
import type { StaffUserRecord } from '../src/modules/staff/staff.repository.js';
import {
  GENERIC_LOGIN_ERROR_MESSAGE,
  LOGIN_ATTEMPT_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MESSAGE,
} from '../src/modules/auth/auth.constants.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';
import { AppError } from '../src/shared/errors.js';
import { createStaffRepositoryFake, createStaffSessionsRepositoryFake } from './fakes.js';

const PASSWORD = 'contrasena-larga-123';
const adminRecord: StaffUserRecord = {
  id: 'staff-1',
  username: 'admin.uno',
  passwordHash: `hash:${PASSWORD}`,
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildAuth(seed: StaffUserRecord[] = [adminRecord]) {
  const staff = createStaffRepositoryFake(seed);
  const sessions = createStaffSessionsRepositoryFake();
  let currentTime = new Date('2026-03-01T12:00:00.000Z');
  let tokenSequence = 0;

  const limiter = createAttemptLimiter({
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_ATTEMPT_WINDOW_MS,
    now: () => currentTime,
  });

  const service = createAuthService({
    staff,
    sessions,
    limiter,
    verifyPassword: (passwordHash, password) =>
      Promise.resolve(passwordHash === `hash:${password}`),
    createToken: () => {
      tokenSequence += 1;
      return `token-${tokenSequence}`;
    },
    hashToken: (token) => `sha256:${token}`,
    now: () => currentTime,
    sessionTtlMs: 60_000,
    dummyPasswordHash: 'hash:contrasena-inexistente',
  });

  return {
    service,
    staff,
    sessions,
    advanceTime: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('authService.login', () => {
  it('crea una sesión y devuelve solo los datos públicos del usuario', async () => {
    const { service, sessions, staff } = buildAuth();

    const result = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    expect(result.staff).toEqual({
      id: adminRecord.id,
      username: adminRecord.username,
      role: 'admin',
    });
    expect(result.token).toBe('token-1');
    expect(result.expiresAt.getTime()).toBe(new Date('2026-03-01T12:01:00.000Z').getTime());
    expect(JSON.stringify(result)).not.toContain('hash:');
    expect([...sessions.records.values()]).toEqual([
      expect.objectContaining({
        tokenHash: 'sha256:token-1',
        staffId: adminRecord.id,
        expiresAt: result.expiresAt,
      }),
    ]);
    expect(staff.records.get(adminRecord.id)?.lastLoginAt).not.toBeNull();
  });

  it('rechaza un usuario inexistente con el mensaje genérico', async () => {
    const { service, sessions } = buildAuth();

    await expect(service.login('no.existe', PASSWORD, '127.0.0.1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: GENERIC_LOGIN_ERROR_MESSAGE,
    });
    expect(sessions.records.size).toBe(0);
  });

  it('rechaza una contraseña incorrecta con el mismo mensaje', async () => {
    const { service, sessions } = buildAuth();

    await expect(
      service.login(adminRecord.username, 'otra-clave', '127.0.0.1'),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: GENERIC_LOGIN_ERROR_MESSAGE,
    });
    expect(sessions.records.size).toBe(0);
  });

  it('rechaza un usuario inactivo sin revelar el motivo', async () => {
    const { service, sessions } = buildAuth([{ ...adminRecord, active: false }]);

    await expect(service.login(adminRecord.username, PASSWORD, '127.0.0.1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: GENERIC_LOGIN_ERROR_MESSAGE,
    });
    expect(sessions.records.size).toBe(0);
  });

  it('bloquea tras varios intentos fallidos aunque la contraseña sea correcta', async () => {
    const { service } = buildAuth();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await expectAppError(
        service.login(adminRecord.username, 'incorrecta', '127.0.0.1'),
        'UNAUTHORIZED',
      );
    }

    await expect(service.login(adminRecord.username, PASSWORD, '127.0.0.1')).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: LOGIN_RATE_LIMIT_MESSAGE,
    });
  });

  it('bloquea por cliente aunque cambie el usuario intentado', async () => {
    const { service } = buildAuth();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await expectAppError(
        service.login(`usuario.${attempt}`, 'incorrecta', '10.0.0.1'),
        'UNAUTHORIZED',
      );
    }

    await expect(service.login(adminRecord.username, PASSWORD, '10.0.0.1')).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('permite volver a intentar cuando vence la ventana de bloqueo', async () => {
    const { service, advanceTime } = buildAuth();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await expectAppError(
        service.login(adminRecord.username, 'incorrecta', '127.0.0.1'),
        'UNAUTHORIZED',
      );
    }

    advanceTime(LOGIN_ATTEMPT_WINDOW_MS);

    const result = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    expect(result.staff.username).toBe(adminRecord.username);
  });

  it('un login exitoso reinicia los intentos fallidos previos', async () => {
    const { service } = buildAuth();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS - 1; attempt += 1) {
      await expectAppError(
        service.login(adminRecord.username, 'incorrecta', '127.0.0.1'),
        'UNAUTHORIZED',
      );
    }

    await expect(service.login(adminRecord.username, PASSWORD, '127.0.0.1')).resolves.toBeDefined();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS - 1; attempt += 1) {
      await expectAppError(
        service.login(adminRecord.username, 'incorrecta', '127.0.0.1'),
        'UNAUTHORIZED',
      );
    }

    await expect(service.login(adminRecord.username, PASSWORD, '127.0.0.1')).resolves.toBeDefined();
  });
});

describe('authService.logout', () => {
  it('elimina la sesión asociada al token', async () => {
    const { service, sessions } = buildAuth();
    const { token } = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    await service.logout(token);

    expect(sessions.records.size).toBe(0);
  });

  it('no falla si el token no existe', async () => {
    const { service } = buildAuth();

    await expect(service.logout('token-desconocido')).resolves.toBeUndefined();
  });
});

describe('authService.resolveSession', () => {
  it('devuelve el usuario de una sesión válida', async () => {
    const { service } = buildAuth();
    const { token } = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    await expect(service.resolveSession(token)).resolves.toEqual({
      id: adminRecord.id,
      username: adminRecord.username,
      role: 'admin',
    });
  });

  it('rechaza un token inexistente', async () => {
    const { service } = buildAuth();

    await expect(service.resolveSession('token-desconocido')).resolves.toBeNull();
  });

  it('rechaza una sesión vencida', async () => {
    const { service, advanceTime } = buildAuth();
    const { token } = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    advanceTime(60_001);

    await expect(service.resolveSession(token)).resolves.toBeNull();
  });

  it('revoca la sesión si el usuario fue desactivado', async () => {
    const { service, staff, sessions } = buildAuth();
    const { token } = await service.login(adminRecord.username, PASSWORD, '127.0.0.1');

    staff.records.set(adminRecord.id, { ...adminRecord, active: false });

    await expect(service.resolveSession(token)).resolves.toBeNull();
    expect(sessions.records.size).toBe(0);
  });
});
