import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import {
  OWNER_ACCESS_MAX_ATTEMPTS,
  OWNER_GENERIC_ERROR_MESSAGE,
  OWNER_RATE_LIMIT_MESSAGE,
} from '../src/modules/public/public.constants.js';
import { OWNER_PIN, activeLot, buildTestApp, inactiveLot } from './test-app.js';

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ statusCode, code });
}

describe('ownerAuthService.access', () => {
  it('crea una sesión ligada al lote y guarda solo el hash del token', async () => {
    const { ownerAuth, ownerSessions } = buildTestApp();

    const result = await ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10');

    expect(result.owner).toEqual({ lotId: activeLot.id, lotNumber: activeLot.lotNumber });
    expect(result.expiresAt.toISOString()).toBe('2026-03-01T12:30:00.000Z');

    const stored = [...ownerSessions.records.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.lotId).toBe(activeLot.id);
    expect(stored[0]?.tokenHash).toBe(`sha256:${result.token}`);
  });

  it('responde con un error genérico si el lote no existe', async () => {
    const { ownerAuth, ownerSessions } = buildTestApp();

    const promise = ownerAuth.access('999', OWNER_PIN, '203.0.113.10');

    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      message: OWNER_GENERIC_ERROR_MESSAGE,
    });
    expect(ownerSessions.records.size).toBe(0);
  });

  it('responde con el mismo error si el PIN es incorrecto', async () => {
    const { ownerAuth } = buildTestApp();

    const promise = ownerAuth.access(activeLot.lotNumber, '9999', '203.0.113.10');

    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      message: OWNER_GENERIC_ERROR_MESSAGE,
    });
  });

  it('rechaza un lote inactivo sin revelar su estado', async () => {
    const { ownerAuth, ownerSessions } = buildTestApp();

    const promise = ownerAuth.access(inactiveLot.lotNumber, OWNER_PIN, '203.0.113.10');

    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      message: OWNER_GENERIC_ERROR_MESSAGE,
    });
    expect(ownerSessions.records.size).toBe(0);
  });

  it('bloquea los intentos fallidos por lote y por IP', async () => {
    const { ownerAuth } = buildTestApp();

    for (let attempt = 0; attempt < OWNER_ACCESS_MAX_ATTEMPTS; attempt += 1) {
      await expect(
        ownerAuth.access(activeLot.lotNumber, '9999', '203.0.113.10'),
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    await expectAppError(
      ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10'),
      429,
      'TOO_MANY_REQUESTS',
    );

    await expect(
      ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.99'),
    ).rejects.toMatchObject({ message: OWNER_RATE_LIMIT_MESSAGE });
  });

  it('reinicia el contador tras un acceso correcto', async () => {
    const { ownerAuth } = buildTestApp();

    for (let attempt = 0; attempt < OWNER_ACCESS_MAX_ATTEMPTS - 1; attempt += 1) {
      await expect(
        ownerAuth.access(activeLot.lotNumber, '9999', '203.0.113.10'),
      ).rejects.toMatchObject({ statusCode: 401 });
    }

    await expect(
      ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10'),
    ).resolves.toBeDefined();

    await expect(
      ownerAuth.access(activeLot.lotNumber, '9999', '203.0.113.10'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('ownerAuthService.resolveSession', () => {
  it('resuelve el lote desde la sesión', async () => {
    const { ownerAuth } = buildTestApp();
    const { token } = await ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10');

    const owner = await ownerAuth.resolveSession(token);

    expect(owner).toEqual({ lotId: activeLot.id, lotNumber: activeLot.lotNumber });
  });

  it('rechaza un token desconocido', async () => {
    const { ownerAuth } = buildTestApp();

    await expect(ownerAuth.resolveSession('token-inventado')).resolves.toBeNull();
  });

  it('rechaza una sesión vencida', async () => {
    const { ownerAuth, ownerSessions } = buildTestApp();
    ownerSessions.records.set('owner-session-1', {
      id: 'owner-session-1',
      tokenHash: 'sha256:vencido',
      lotId: activeLot.id,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(ownerAuth.resolveSession('vencido')).resolves.toBeNull();
  });

  it('invalida y elimina la sesión si el lote fue desactivado', async () => {
    const { ownerAuth, lots, ownerSessions } = buildTestApp();
    const { token } = await ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10');
    const record = lots.records.get(activeLot.id);
    if (record === undefined) {
      throw new Error('lote de prueba inexistente');
    }
    lots.records.set(activeLot.id, { ...record, active: false });

    await expect(ownerAuth.resolveSession(token)).resolves.toBeNull();
    expect(ownerSessions.records.size).toBe(0);
  });
});

describe('ownerAuthService.logout', () => {
  it('revoca la sesión del propietario', async () => {
    const { ownerAuth, ownerSessions } = buildTestApp();
    const { token } = await ownerAuth.access(activeLot.lotNumber, OWNER_PIN, '203.0.113.10');

    await ownerAuth.logout(token);

    expect(ownerSessions.records.size).toBe(0);
    await expect(ownerAuth.resolveSession(token)).resolves.toBeNull();
  });
});
