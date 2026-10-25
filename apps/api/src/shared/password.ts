import { hash, verify } from '@node-rs/argon2';

// No se fija `algorithm`: el valor por defecto del paquete es Argon2id y su `const enum`
// no se puede importar con `verbatimModuleSyntax` habilitado.
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON2_OPTIONS);
}

export async function verifySecret(secretHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(secretHash, secret);
  } catch {
    return false;
  }
}
