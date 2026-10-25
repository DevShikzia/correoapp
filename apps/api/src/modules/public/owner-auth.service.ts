import type { AuthenticatedOwner } from '../../shared/authenticated-owner.js';
import { AppError } from '../../shared/errors.js';
import type { AttemptLimiter } from '../auth/login-rate-limit.js';
import type { LotCredentials, LotRecord } from '../lots/lots.repository.js';
import type { PublicSessionsRepository } from './public-sessions.repository.js';
import { OWNER_GENERIC_ERROR_MESSAGE, OWNER_RATE_LIMIT_MESSAGE } from './public.constants.js';

export interface OwnerAccessResult {
  token: string;
  expiresAt: Date;
  owner: AuthenticatedOwner;
}

export interface OwnerAuthServiceDeps {
  lots: {
    findCredentialsByLotNumber(lotNumber: string): Promise<LotCredentials | null>;
    findById(id: string): Promise<LotRecord | null>;
  };
  sessions: PublicSessionsRepository;
  limiter: AttemptLimiter;
  verifyPin: (pinHash: string, pin: string) => Promise<boolean>;
  createToken: () => string;
  hashToken: (token: string) => string;
  now: () => Date;
  sessionTtlMs: number;
  dummySecretHash: string;
}

export interface OwnerAuthService {
  access(lotNumber: string, pin: string, clientKey: string): Promise<OwnerAccessResult>;
  logout(token: string): Promise<void>;
  resolveSession(token: string): Promise<AuthenticatedOwner | null>;
}

export function createOwnerAuthService(deps: OwnerAuthServiceDeps): OwnerAuthService {
  function lotKey(lotNumber: string): string {
    return `lot:${lotNumber}`;
  }

  function clientAttemptKey(clientAddress: string): string {
    return `client:${clientAddress}`;
  }

  function registerFailure(lotNumber: string, clientAddress: string): void {
    deps.limiter.registerFailure(lotKey(lotNumber));
    deps.limiter.registerFailure(clientAttemptKey(clientAddress));
  }

  function assertNotBlocked(lotNumber: string, clientAddress: string): void {
    if (
      deps.limiter.isBlocked(lotKey(lotNumber)) ||
      deps.limiter.isBlocked(clientAttemptKey(clientAddress))
    ) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', OWNER_RATE_LIMIT_MESSAGE);
    }
  }

  return {
    async access(
      lotNumber: string,
      pin: string,
      clientAddress: string,
    ): Promise<OwnerAccessResult> {
      assertNotBlocked(lotNumber, clientAddress);

      const credentials = await deps.lots.findCredentialsByLotNumber(lotNumber);
      const pinMatches = await deps.verifyPin(credentials?.pinHash ?? deps.dummySecretHash, pin);

      if (credentials === null || !pinMatches || !credentials.active) {
        registerFailure(lotNumber, clientAddress);
        throw new AppError(401, 'UNAUTHORIZED', OWNER_GENERIC_ERROR_MESSAGE);
      }

      deps.limiter.reset(lotKey(lotNumber));
      deps.limiter.reset(clientAttemptKey(clientAddress));

      const token = deps.createToken();
      const expiresAt = new Date(deps.now().getTime() + deps.sessionTtlMs);

      await deps.sessions.create({
        tokenHash: deps.hashToken(token),
        lotId: credentials.id,
        expiresAt,
      });

      return {
        token,
        expiresAt,
        owner: { lotId: credentials.id, lotNumber: credentials.lotNumber },
      };
    },

    async logout(token: string): Promise<void> {
      await deps.sessions.deleteByTokenHash(deps.hashToken(token));
    },

    async resolveSession(token: string): Promise<AuthenticatedOwner | null> {
      const tokenHash = deps.hashToken(token);
      const session = await deps.sessions.findActiveByTokenHash(tokenHash, deps.now());

      if (session === null) {
        return null;
      }

      const lot = await deps.lots.findById(session.lotId);

      if (lot === null || !lot.active) {
        await deps.sessions.deleteByTokenHash(tokenHash);
        return null;
      }

      return { lotId: lot.id, lotNumber: lot.lotNumber };
    },
  };
}
