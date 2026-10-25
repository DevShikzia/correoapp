import type { Request } from 'express';

export function readRouteParam(request: Request, name: string): string {
  const value = request.params[name];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}
