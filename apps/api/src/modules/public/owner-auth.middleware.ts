import type { RequestHandler } from 'express';
import type { AuthenticatedOwner } from '../../shared/authenticated-owner.js';
import {
  buildSessionCookieOptions,
  OWNER_SESSION_COOKIE,
  readCookie,
} from '../../shared/cookies.js';
import { AppError } from '../../shared/errors.js';
import type { SessionCookieConfig } from '../auth/auth.middleware.js';
import type { OwnerAuthService } from './owner-auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      owner?: AuthenticatedOwner;
    }
  }
}

export function createRequireOwnerAuth(
  service: OwnerAuthService,
  config: SessionCookieConfig,
): RequestHandler {
  return (request, response, next) => {
    void (async (): Promise<void> => {
      const token = readCookie(request, OWNER_SESSION_COOKIE);

      if (token === undefined) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesión requerida.');
      }

      const owner = await service.resolveSession(token);

      if (owner === null) {
        response.clearCookie(
          OWNER_SESSION_COOKIE,
          buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
        );
        throw new AppError(401, 'UNAUTHORIZED', 'Sesión inválida o vencida.');
      }

      request.owner = owner;
      next();
    })().catch(next);
  };
}
