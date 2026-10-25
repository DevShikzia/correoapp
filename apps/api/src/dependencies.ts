import type { RequestHandler } from 'express';
import { env } from './config/env.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import type { SessionCookieConfig } from './modules/auth/auth.middleware.js';
import { createRequireStaffAuth } from './modules/auth/auth.middleware.js';
import { staffSessionsRepository } from './modules/auth/auth-sessions.repository.js';
import { LOGIN_ATTEMPT_WINDOW_MS, LOGIN_MAX_ATTEMPTS } from './modules/auth/auth.constants.js';
import { DUMMY_PASSWORD_HASH } from './modules/auth/dummy-password-hash.js';
import { createAttemptLimiter } from './modules/auth/login-rate-limit.js';
import { auditRepository } from './modules/audit/audit.repository.js';
import { lotRepository } from './modules/lots/lots.repository.js';
import type { LotsService } from './modules/lots/lots.service.js';
import { createLotsService } from './modules/lots/lots.service.js';
import { mailRepository } from './modules/mail/mail.repository.js';
import type { MailService } from './modules/mail/mail.service.js';
import { createMailService } from './modules/mail/mail.service.js';
import { staffRepository } from './modules/staff/staff.repository.js';
import type { StaffService } from './modules/staff/staff.service.js';
import { createStaffService } from './modules/staff/staff.service.js';
import { hashSecret, verifySecret } from './shared/password.js';
import { createSessionToken, hashSessionToken } from './shared/session-token.js';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface AppDependencies {
  auth: AuthService;
  lots: LotsService;
  staff: StaffService;
  mail: MailService;
  requireStaffAuth: RequestHandler;
  cookie: SessionCookieConfig;
  allowedOrigin: string | undefined;
}

export function createDefaultDependencies(): AppDependencies {
  const sessionTtlMs = env.STAFF_SESSION_TTL_MINUTES * MILLISECONDS_PER_MINUTE;

  const cookie: SessionCookieConfig = {
    secureCookies: env.NODE_ENV === 'production',
    sessionTtlMs,
  };

  const auth = createAuthService({
    staff: staffRepository,
    sessions: staffSessionsRepository,
    limiter: createAttemptLimiter({
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      windowMs: LOGIN_ATTEMPT_WINDOW_MS,
    }),
    verifyPassword: verifySecret,
    createToken: createSessionToken,
    hashToken: hashSessionToken,
    now: () => new Date(),
    sessionTtlMs,
    dummyPasswordHash: DUMMY_PASSWORD_HASH,
  });

  return {
    auth,
    lots: createLotsService({
      lots: lotRepository,
      audit: auditRepository,
      hashPin: hashSecret,
    }),
    staff: createStaffService({
      staff: staffRepository,
      audit: auditRepository,
      hashPassword: hashSecret,
      sessions: staffSessionsRepository,
    }),
    mail: createMailService({
      mail: mailRepository,
      lots: lotRepository,
      audit: auditRepository,
      now: () => new Date(),
    }),
    requireStaffAuth: createRequireStaffAuth(auth, cookie),
    cookie,
    allowedOrigin: env.APP_ORIGIN,
  };
}
