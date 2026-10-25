import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  // En producción los índices se crean con `sync:indexes`, no al iniciar la API.
  mongoose.set('autoIndex', env.NODE_ENV !== 'production');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
  logger.info('conexión a MongoDB establecida');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
