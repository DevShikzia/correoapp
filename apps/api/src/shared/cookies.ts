import type { Request } from 'express';

export const STAFF_SESSION_COOKIE = 'staff_session';

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}

export function buildSessionCookieOptions(secure: boolean, maxAgeMs: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;

  if (header === undefined) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();

    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}
