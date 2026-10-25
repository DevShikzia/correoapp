import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from '../src/shared/password.js';

describe('hashSecret', () => {
  it('genera un hash distinto del secreto original', async () => {
    const secret = 'contrasena-de-prueba-123';

    const secretHash = await hashSecret(secret);

    expect(secretHash).not.toBe(secret);
    expect(secretHash.startsWith('$argon2id$')).toBe(true);
  });

  it('genera hashes distintos para el mismo secreto', async () => {
    const first = await hashSecret('1234');
    const second = await hashSecret('1234');

    expect(first).not.toBe(second);
  });

  it('verifica el secreto correcto y rechaza el incorrecto', async () => {
    const secretHash = await hashSecret('1234');

    await expect(verifySecret(secretHash, '1234')).resolves.toBe(true);
    await expect(verifySecret(secretHash, '4321')).resolves.toBe(false);
  });

  it('rechaza un hash inválido sin lanzar', async () => {
    await expect(verifySecret('no-es-un-hash', '1234')).resolves.toBe(false);
  });
});
