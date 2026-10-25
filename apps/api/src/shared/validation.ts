import { AppError } from './errors.js';

interface ParseResult<T> {
  success: boolean;
  data?: T;
}

interface Parser<T> {
  safeParse(value: unknown): ParseResult<T>;
}

export function parseOrThrow<T>(schema: Parser<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success || result.data === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Revisá los datos ingresados.');
  }

  return result.data;
}
