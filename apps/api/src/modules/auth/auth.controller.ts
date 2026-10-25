import type { Request, Response } from 'express';
import { requireStaff } from '../../shared/auth-context.js';
import {
  buildSessionCookieOptions,
  readCookie,
  STAFF_SESSION_COOKIE,
} from '../../shared/cookies.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { SessionCookieConfig } from './auth.middleware.js';
import type { AuthService } from './auth.service.js';
import { loginSchema } from './auth.validator.js';

export function createAuthController(service: AuthService, config: SessionCookieConfig) {
  return {
    async login(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(loginSchema, request.body);
      const result = await service.login(
        input.username,
        input.password,
        request.ip ?? 'desconocido',
      );

      response.cookie(
        STAFF_SESSION_COOKIE,
        result.token,
        buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
      );
      response.status(200).json({ data: { user: result.staff, expiresAt: result.expiresAt } });
    },

    async logout(request: Request, response: Response): Promise<void> {
      const token = readCookie(request, STAFF_SESSION_COOKIE);

      if (token !== undefined) {
        await service.logout(token);
      }

      response.clearCookie(
        STAFF_SESSION_COOKIE,
        buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
      );
      response.status(204).end();
    },

    me(request: Request, response: Response): void {
      response.status(200).json({ data: { user: requireStaff(request) } });
    },
  };
}
