import type { Request, Response } from 'express';
import { requireOwner } from '../../shared/auth-context.js';
import {
  buildSessionCookieOptions,
  OWNER_SESSION_COOKIE,
  readCookie,
} from '../../shared/cookies.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { SessionCookieConfig } from '../auth/auth.middleware.js';
import type { OwnerAuthService } from './owner-auth.service.js';
import { ownerAccessSchema } from './owner.validator.js';

export function createOwnerAuthController(service: OwnerAuthService, config: SessionCookieConfig) {
  return {
    async access(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(ownerAccessSchema, request.body);
      const result = await service.access(input.lotNumber, input.pin, request.ip ?? 'desconocido');

      response.cookie(
        OWNER_SESSION_COOKIE,
        result.token,
        buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
      );
      response.status(200).json({
        data: { lotNumber: result.owner.lotNumber, expiresAt: result.expiresAt },
      });
    },

    async logout(request: Request, response: Response): Promise<void> {
      const token = readCookie(request, OWNER_SESSION_COOKIE);

      if (token !== undefined) {
        await service.logout(token);
      }

      response.clearCookie(
        OWNER_SESSION_COOKIE,
        buildSessionCookieOptions(config.secureCookies, config.sessionTtlMs),
      );
      response.status(204).end();
    },

    me(request: Request, response: Response): void {
      const owner = requireOwner(request);

      response.status(200).json({ data: { lotNumber: owner.lotNumber } });
    },
  };
}
