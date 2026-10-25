import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/errors.js';

interface BodyParserError {
  type: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string' &&
    (error as BodyParserError).type.startsWith('entity.')
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (isBodyParserError(error)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'El cuerpo de la petición no es válido.' },
    });
    return;
  }

  logger.error({ err: error, method: req.method, path: req.path }, 'error no controlado');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
  });
}
