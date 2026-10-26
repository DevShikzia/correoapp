import type { RequestHandler } from 'express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import type { SessionCookieConfig } from './modules/auth/auth.middleware.js';
import { createRequireStaffAuth } from './modules/auth/auth.middleware.js';
import { staffSessionsRepository } from './modules/auth/auth-sessions.repository.js';
import { LOGIN_ATTEMPT_WINDOW_MS, LOGIN_MAX_ATTEMPTS } from './modules/auth/auth.constants.js';
import { createAttemptLimiter } from './modules/auth/login-rate-limit.js';
import type { AttemptLimiter } from './modules/auth/login-rate-limit.js';
import { createRedisAttemptLimiter } from './modules/auth/redis-attempt-limiter.js';
import { auditRepository } from './modules/audit/audit.repository.js';
import { lotRepository } from './modules/lots/lots.repository.js';
import type { LotsService } from './modules/lots/lots.service.js';
import { createLotsService } from './modules/lots/lots.service.js';
import { mailRepository } from './modules/mail/mail.repository.js';
import type { MailService } from './modules/mail/mail.service.js';
import { createMailService } from './modules/mail/mail.service.js';
import { createBullNotificationQueue } from './modules/notifications/notification-queue.js';
import { notificationRepository } from './modules/notifications/notification.repository.js';
import type { MailNotifier } from './modules/notifications/notification.service.js';
import type { NotificationQueue } from './modules/notifications/notification.service.js';
import {
  createDisabledNotifier,
  createNotificationService,
} from './modules/notifications/notification.service.js';
import type { NotificationAdminService } from './modules/notifications/notification-admin.service.js';
import { createNotificationAdminService } from './modules/notifications/notification-admin.service.js';
import type { WhatsappWebhookService } from './modules/notifications/whatsapp-webhook.service.js';
import { createWhatsappWebhookService } from './modules/notifications/whatsapp-webhook.service.js';
import { createRequireOwnerAuth } from './modules/public/owner-auth.middleware.js';
import type { OwnerAuthService } from './modules/public/owner-auth.service.js';
import { createOwnerAuthService } from './modules/public/owner-auth.service.js';
import type { OwnerMailService } from './modules/public/owner-mail.service.js';
import { createOwnerMailService } from './modules/public/owner-mail.service.js';
import {
  OWNER_ACCESS_MAX_ATTEMPTS,
  OWNER_ACCESS_WINDOW_MS,
} from './modules/public/public.constants.js';
import { publicSessionsRepository } from './modules/public/public-sessions.repository.js';
import { staffRepository } from './modules/staff/staff.repository.js';
import type { StaffService } from './modules/staff/staff.service.js';
import { createStaffService } from './modules/staff/staff.service.js';
import { hashSecret, verifySecret } from './shared/password.js';
import { DUMMY_SECRET_HASH } from './shared/dummy-hash.js';
import { createSessionToken, hashSessionToken } from './shared/session-token.js';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface AppDependencies {
  auth: AuthService;
  lots: LotsService;
  staff: StaffService;
  mail: MailService;
  notifications: MailNotifier;
  notificationAdmin: NotificationAdminService;
  whatsappWebhook: WhatsappWebhookService;
  ownerAuth: OwnerAuthService;
  ownerMail: OwnerMailService;
  requireStaffAuth: RequestHandler;
  requireOwnerAuth: RequestHandler;
  cookie: SessionCookieConfig;
  ownerCookie: SessionCookieConfig;
  allowedOrigin: string | undefined;
}

const UNAVAILABLE_QUEUE: NotificationQueue = {
  async enqueue(): Promise<void> {
    throw new Error('La cola de notificaciones no está habilitada');
  },
};

const RATE_LIMIT_KEY_PREFIXES = {
  staff: 'ratelimit:staff',
  owner: 'ratelimit:owner',
} as const;

interface RateLimiters {
  staff: AttemptLimiter;
  owner: AttemptLimiter;
}

/**
 * Con REDIS_URL configurada, staff y propietarios comparten los contadores entre
 * instancias. Sin Redis se usa memoria local: sirve para desarrollo o una única
 * instancia, pero no coordina varias réplicas.
 */
function createRateLimiters(): RateLimiters {
  const staff = { maxAttempts: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_ATTEMPT_WINDOW_MS };
  const owner = {
    maxAttempts: OWNER_ACCESS_MAX_ATTEMPTS,
    windowMs: OWNER_ACCESS_WINDOW_MS,
  };

  if (env.REDIS_URL === undefined) {
    if (env.NODE_ENV === 'production') {
      logger.warn('rate limit en memoria: no se comparte entre instancias');
    }

    return {
      staff: createAttemptLimiter(staff),
      owner: createAttemptLimiter(owner),
    };
  }

  return {
    staff: createRedisAttemptLimiter({
      redisUrl: env.REDIS_URL,
      keyPrefix: RATE_LIMIT_KEY_PREFIXES.staff,
      logger,
      ...staff,
    }),
    owner: createRedisAttemptLimiter({
      redisUrl: env.REDIS_URL,
      keyPrefix: RATE_LIMIT_KEY_PREFIXES.owner,
      logger,
      ...owner,
    }),
  };
}

interface NotificationDependencies {
  notifier: MailNotifier;
  admin: NotificationAdminService;
}

function createNotificationDependencies(): NotificationDependencies {
  if (!env.NOTIFICATIONS_ENABLED || env.REDIS_URL === undefined) {
    return {
      notifier: createDisabledNotifier(),
      admin: createNotificationAdminService({
        jobs: notificationRepository,
        queue: UNAVAILABLE_QUEUE,
        audit: auditRepository,
        logger,
        enabled: false,
      }),
    };
  }

  const queue = createBullNotificationQueue(env.REDIS_URL, logger);

  return {
    notifier: createNotificationService({
      jobs: notificationRepository,
      queue,
      logger,
      enabled: true,
    }),
    admin: createNotificationAdminService({
      jobs: notificationRepository,
      queue,
      audit: auditRepository,
      logger,
      enabled: true,
    }),
  };
}

export function createDefaultDependencies(): AppDependencies {
  const sessionTtlMs = env.STAFF_SESSION_TTL_MINUTES * MILLISECONDS_PER_MINUTE;
  const limiters = createRateLimiters();

  const cookie: SessionCookieConfig = {
    secureCookies: env.NODE_ENV === 'production',
    sessionTtlMs,
  };

  const ownerSessionTtlMs = env.PUBLIC_SESSION_TTL_MINUTES * MILLISECONDS_PER_MINUTE;
  const ownerCookie: SessionCookieConfig = {
    secureCookies: env.NODE_ENV === 'production',
    sessionTtlMs: ownerSessionTtlMs,
  };

  const ownerAuth = createOwnerAuthService({
    lots: lotRepository,
    sessions: publicSessionsRepository,
    limiter: limiters.owner,
    verifyPin: verifySecret,
    createToken: createSessionToken,
    hashToken: hashSessionToken,
    now: () => new Date(),
    sessionTtlMs: ownerSessionTtlMs,
    dummySecretHash: DUMMY_SECRET_HASH,
  });

  const auth = createAuthService({
    staff: staffRepository,
    sessions: staffSessionsRepository,
    limiter: limiters.staff,
    verifyPassword: verifySecret,
    createToken: createSessionToken,
    hashToken: hashSessionToken,
    now: () => new Date(),
    sessionTtlMs,
    dummyPasswordHash: DUMMY_SECRET_HASH,
  });

  const { notifier, admin: notificationAdmin } = createNotificationDependencies();
  const whatsappWebhook = createWhatsappWebhookService({
    appSecret: env.WHATSAPP_APP_SECRET,
    verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    jobs: notificationRepository,
    logger,
  });

  return {
    auth,
    lots: createLotsService({
      lots: lotRepository,
      audit: auditRepository,
      hashPin: hashSecret,
      ownerSessions: publicSessionsRepository,
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
      notifier,
      now: () => new Date(),
    }),
    notifications: notifier,
    notificationAdmin,
    whatsappWebhook,
    ownerAuth,
    ownerMail: createOwnerMailService({ mail: mailRepository }),
    requireStaffAuth: createRequireStaffAuth(auth, cookie),
    requireOwnerAuth: createRequireOwnerAuth(ownerAuth, ownerCookie),
    cookie,
    ownerCookie,
    allowedOrigin: env.APP_ORIGIN,
  };
}
