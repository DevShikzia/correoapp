import { HttpErrorResponse } from '@angular/common/http';

const GENERIC_ERROR_MESSAGE = 'Ocurrió un error. Intentá de nuevo.';
const CONNECTION_ERROR_MESSAGE = 'No pudimos conectar con el servidor. Revisá tu conexión.';
const INVALID_ACCESS_MESSAGE = 'Lote o PIN incorrectos.';
const EXPIRED_SESSION_MESSAGE = 'Tu sesión venció. Ingresá nuevamente.';
const RATE_LIMIT_MESSAGE = 'Demasiados intentos. Esperá unos minutos.';
const INVALID_INPUT_MESSAGE = 'Revisá los datos ingresados.';
const SERVER_ERROR_MESSAGE = 'El servidor no está disponible. Intentá más tarde.';
const MAX_API_MESSAGE_LENGTH = 200;

type ErrorContext = 'access' | 'session' | 'list';

export function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

export function ownerErrorMessage(error: unknown, context: ErrorContext): string {
  if (!(error instanceof HttpErrorResponse)) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (error.status === 0) {
    return CONNECTION_ERROR_MESSAGE;
  }

  if (error.status === 401) {
    return context === 'access' ? INVALID_ACCESS_MESSAGE : EXPIRED_SESSION_MESSAGE;
  }

  const apiMessage = readApiMessage(error);

  if (error.status === 429) {
    return apiMessage ?? RATE_LIMIT_MESSAGE;
  }

  if (error.status === 400) {
    return apiMessage ?? INVALID_INPUT_MESSAGE;
  }

  if (error.status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }

  return apiMessage ?? GENERIC_ERROR_MESSAGE;
}

function readApiMessage(error: HttpErrorResponse): string | null {
  const body = error.error as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;

  if (
    typeof message !== 'string' ||
    message.length === 0 ||
    message.length > MAX_API_MESSAGE_LENGTH
  ) {
    return null;
  }

  return message;
}
