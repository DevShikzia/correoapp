import mongoose from 'mongoose';

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  // Los índices los administra la API con `sync:indexes`.
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
