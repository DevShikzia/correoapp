import type { Actor } from './actor.js';
import { AppError } from './errors.js';

export function assertAdmin(actor: Actor): void {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'No autorizado.');
  }
}
