import type { AuthenticatedStaff } from '../../shared/authenticated-staff.js';
import { AppError } from '../../shared/errors.js';
import type { StaffRepository } from '../staff/staff.repository.js';
import { GENERIC_LOGIN_ERROR_MESSAGE, LOGIN_RATE_LIMIT_MESSAGE } from './auth.constants.js';
import type { StaffSessionsRepository } from './auth-sessions.repository.js';
import type { AttemptLimiter } from './login-rate-limit.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  staff: AuthenticatedStaff;
}

export interface AuthServiceDeps {
  staff: StaffRepository;
  sessions: StaffSessionsRepository;
  limiter: AttemptLimiter;
  verifyPassword: (passwordHash: string, password: string) => Promise<boolean>;
  createToken: () => string;
  hashToken: (token: string) => string;
  now: () => Date;
  sessionTtlMs: number;
  dummyPasswordHash: string;
}

export interface AuthService {
  login(username: string, password: string, clientKey: string): Promise<LoginResult>;
  logout(token: string): Promise<void>;
  resolveSession(token: string): Promise<AuthenticatedStaff | null>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  function userKey(username: string): string {
    return `user:${username}`;
  }

  function clientAttemptKey(clientKey: string): string {
    return `client:${clientKey}`;
  }

  function registerFailure(username: string, clientKey: string): void {
    deps.limiter.registerFailure(userKey(username));
    deps.limiter.registerFailure(clientAttemptKey(clientKey));
  }

  function assertNotBlocked(username: string, clientKey: string): void {
    if (
      deps.limiter.isBlocked(userKey(username)) ||
      deps.limiter.isBlocked(clientAttemptKey(clientKey))
    ) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', LOGIN_RATE_LIMIT_MESSAGE);
    }
  }

  return {
    async login(username: string, password: string, clientKey: string): Promise<LoginResult> {
      assertNotBlocked(username, clientKey);

      const user = await deps.staff.findByUsername(username);
      const passwordMatches = await deps.verifyPassword(
        user?.passwordHash ?? deps.dummyPasswordHash,
        password,
      );

      if (user === null || !passwordMatches || !user.active) {
        registerFailure(username, clientKey);
        throw new AppError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
      }

      deps.limiter.reset(userKey(username));
      deps.limiter.reset(clientAttemptKey(clientKey));

      await deps.staff.touchLastLogin(user.id);

      const token = deps.createToken();
      const expiresAt = new Date(deps.now().getTime() + deps.sessionTtlMs);

      await deps.sessions.create({
        tokenHash: deps.hashToken(token),
        staffId: user.id,
        expiresAt,
      });

      return {
        token,
        expiresAt,
        staff: { id: user.id, username: user.username, role: user.role },
      };
    },

    async logout(token: string): Promise<void> {
      await deps.sessions.deleteByTokenHash(deps.hashToken(token));
    },

    async resolveSession(token: string): Promise<AuthenticatedStaff | null> {
      const tokenHash = deps.hashToken(token);
      const session = await deps.sessions.findActiveByTokenHash(tokenHash, deps.now());

      if (session === null) {
        return null;
      }

      const user = await deps.staff.findById(session.staffId);

      if (user === null || !user.active) {
        await deps.sessions.deleteByTokenHash(tokenHash);
        return null;
      }

      return { id: user.id, username: user.username, role: user.role };
    },
  };
}
