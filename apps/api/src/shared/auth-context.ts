import type { Request } from 'express';
import type { AuthenticatedStaff } from './authenticated-staff.js';
import { AppError } from './errors.js';

export function requireStaff(request: Request): AuthenticatedStaff {
  if (request.staff === undefined) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sesión requerida.');
  }

  return request.staff;
}

export function getRequestId(request: Request): string | undefined {
  const requestId = (request as { id?: unknown }).id;

  if (requestId === undefined || requestId === null) {
    return undefined;
  }

  return String(requestId);
}
