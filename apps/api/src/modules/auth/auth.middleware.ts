import type { RequestHandler } from 'express';
import type { AuthenticatedStaff } from '../../shared/authenticated-staff.js';
import {
  buildSessionCookieOptions,
  readCookie,
  STAFF_SESSION_COOKIE,
} from '../../shared/cookies.js';
import { AppError } from '../../shared/errors.js';
import type { AuthService } from './auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: AuthenticatedStaff;
    }
  }
}

export interface SessionCookieConfig {
  secureCookies: boolean;
  sessionTtlMs: number;
}

export function createRequireStaffAuth(
  service: AuthService,
  config: SessionCookieConfig,
): RequestHandler {
  return (request, response, next) => {
    void (async (): Promise<void> => {
      const token = readCookie(request, STAFF_SESSION_COOKIE);

      if (token === undefined) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesión requerida.');
      }

      const staff = await service.resolveSession(token);

      if (staff === null) {
        response.clearCookie(
          STAFF_SESSION_COOKIE,
          buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
        );
        throw new AppError(401, 'UNAUTHORIZED', 'Sesión inválida o vencida.');
      }

      request.staff = staff;
      next();
    })().catch(next);
  };
}
