import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { staffRepository } from '../modules/staff/staff.repository.js';
import { passwordSchema, usernameSchema } from '../modules/staff/staff.validator.js';
import { hashSecret } from '../shared/password.js';

const bootstrapSchema = z.object({
  ADMIN_USERNAME: usernameSchema,
  ADMIN_PASSWORD: passwordSchema,
});

async function bootstrapAdmin(): Promise<void> {
  const parsed = bootstrapSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Datos inválidos:\n${details.join('\n')}`);
  }

  if (env.MONGODB_URI === undefined) {
    throw new Error('Definí MONGODB_URI para crear el administrador.');
  }

  await connectDatabase(env.MONGODB_URI);

  try {
    const existing = await staffRepository.findByUsername(parsed.data.ADMIN_USERNAME);

    if (existing !== null) {
      throw new Error('El usuario ya existe; no se modifica.');
    }

    const passwordHash = await hashSecret(parsed.data.ADMIN_PASSWORD);

    await staffRepository.create({
      username: parsed.data.ADMIN_USERNAME,
      passwordHash,
      role: 'admin',
    });

    logger.info({ username: parsed.data.ADMIN_USERNAME }, 'administrador creado');
  } finally {
    await disconnectDatabase();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  logger.error({ err: error }, 'no se pudo crear el administrador');
  process.exit(1);
});
