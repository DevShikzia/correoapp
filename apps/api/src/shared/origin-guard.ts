import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createOriginGuard(allowedOrigin: string | undefined): RequestHandler {
  return (request, _response, next) => {
    if (allowedOrigin === undefined || !MUTATING_METHODS.has(request.method)) {
      next();
      return;
    }

    if (request.get('origin') !== allowedOrigin) {
      next(new AppError(403, 'FORBIDDEN', 'Origen no permitido.'));
      return;
    }

    next();
  };
}
