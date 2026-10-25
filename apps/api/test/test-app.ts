import { createApp } from '../src/app.js';
import type { AppDependencies } from '../src/dependencies.js';
import { LOGIN_MAX_ATTEMPTS } from '../src/modules/auth/auth.constants.js';
import { createRequireStaffAuth } from '../src/modules/auth/auth.middleware.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';
import { createLotsService } from '../src/modules/lots/lots.service.js';
import type { LotRecord } from '../src/modules/lots/lots.repository.js';
import type { MailItemRecord } from '../src/modules/mail/mail.repository.js';
import { createMailService } from '../src/modules/mail/mail.service.js';
import type { NotificationJobRecord } from '../src/modules/notifications/notification.repository.js';
import { createWhatsappWebhookService } from '../src/modules/notifications/whatsapp-webhook.service.js';
import { createRequireOwnerAuth } from '../src/modules/public/owner-auth.middleware.js';
import { createOwnerAuthService } from '../src/modules/public/owner-auth.service.js';
import { createOwnerMailService } from '../src/modules/public/owner-mail.service.js';
import {
  OWNER_ACCESS_MAX_ATTEMPTS,
  OWNER_ACCESS_WINDOW_MS,
} from '../src/modules/public/public.constants.js';
import type { StaffUserRecord } from '../src/modules/staff/staff.repository.js';
import { createStaffService } from '../src/modules/staff/staff.service.js';
import {
  createAuditRepositoryFake,
  createLotRepositoryFake,
  createMailNotifierFake,
  createMailRepositoryFake,
  createNotificationRepositoryFake,
  createPublicSessionsRepositoryFake,
  createStaffRepositoryFake,
  createStaffSessionsRepositoryFake,
} from './fakes.js';

export const ADMIN_PASSWORD = 'contrasena-admin-123';
export const GUARD_PASSWORD = 'contrasena-guard-123';
export const ADMIN_ORIGIN = 'http://localhost:4200';
export const OWNER_PIN = '1234';
export const WEBHOOK_APP_SECRET = 'secreto-de-prueba-para-firmas';
export const WEBHOOK_VERIFY_TOKEN = 'token-de-verificacion-prueba';

const silentLogger = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

const FIXED_NOW = new Date('2026-03-01T12:00:00.000Z');
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const OWNER_SESSION_TTL_MS = 30 * MILLISECONDS_PER_MINUTE;

export const adminRecord: StaffUserRecord = {
  id: 'staff-admin',
  username: 'admin.uno',
  passwordHash: `hash:${ADMIN_PASSWORD}`,
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const guardRecord: StaffUserRecord = {
  ...adminRecord,
  id: 'staff-guard',
  username: 'vigilante.uno',
  passwordHash: `hash:${GUARD_PASSWORD}`,
  role: 'guard',
};

export const inactiveRecord: StaffUserRecord = {
  ...guardRecord,
  id: 'staff-inactive',
  username: 'vigilante.inactivo',
  active: false,
};

export const activeLot: LotRecord = {
  id: 'lot-42',
  lotNumber: '42',
  ownerNames: ['Ana Pérez'],
  contacts: [{ name: 'Ana Pérez', phone: '+5491122334455' }],
  pinHash: `hash:${OWNER_PIN}`,
  active: true,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

export const inactiveLot: LotRecord = {
  ...activeLot,
  id: 'lot-43',
  lotNumber: '43',
  active: false,
};

export interface TestAppOptions {
  allowedOrigin?: string;
  now?: Date;
  lots?: LotRecord[];
  mail?: MailItemRecord[];
  notifications?: NotificationJobRecord[];
}

export function buildTestApp(options: TestAppOptions = {}) {
  const now = options.now ?? FIXED_NOW;
  const staff = createStaffRepositoryFake([adminRecord, guardRecord, inactiveRecord]);
  const sessions = createStaffSessionsRepositoryFake();
  const audit = createAuditRepositoryFake();
  const lots = createLotRepositoryFake(options.lots ?? [activeLot, inactiveLot]);
  const mail = createMailRepositoryFake(options.mail ?? []);
  const notifier = createMailNotifierFake();
  const notificationJobs = createNotificationRepositoryFake(options.notifications ?? []);
  const ownerSessions = createPublicSessionsRepositoryFake();
  const cookie = { secureCookies: false, sessionTtlMs: 60_000 };
  const ownerCookie = { secureCookies: false, sessionTtlMs: OWNER_SESSION_TTL_MS };

  const auth = createAuthService({
    staff,
    sessions,
    limiter: createAttemptLimiter({
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      windowMs: 60_000,
      now: () => FIXED_NOW,
    }),
    verifyPassword: (passwordHash, password) =>
      Promise.resolve(passwordHash === `hash:${password}`),
    createToken: () => `token-${sessions.records.size + 1}-${Math.random()}`,
    hashToken: (token) => `sha256:${token}`,
    now: () => FIXED_NOW,
    sessionTtlMs: cookie.sessionTtlMs,
    dummyPasswordHash: 'hash:contrasena-inexistente',
  });

  const ownerAuth = createOwnerAuthService({
    lots,
    sessions: ownerSessions,
    limiter: createAttemptLimiter({
      maxAttempts: OWNER_ACCESS_MAX_ATTEMPTS,
      windowMs: OWNER_ACCESS_WINDOW_MS,
      now: () => now,
    }),
    verifyPin: (pinHash, pin) => Promise.resolve(pinHash === `hash:${pin}`),
    createToken: () => `owner-token-${ownerSessions.records.size + 1}-${Math.random()}`,
    hashToken: (token) => `sha256:${token}`,
    now: () => now,
    sessionTtlMs: ownerCookie.sessionTtlMs,
    dummySecretHash: 'hash:pin-inexistente',
  });

  const dependencies: AppDependencies = {
    auth,
    lots: createLotsService({
      lots,
      audit,
      hashPin: (pin) => Promise.resolve(`hash:${pin}`),
      ownerSessions,
    }),
    staff: createStaffService({
      staff,
      audit,
      hashPassword: (password) => Promise.resolve(`hash:${password}`),
      sessions,
    }),
    mail: createMailService({
      mail,
      lots,
      audit,
      notifier,
      now: () => now,
    }),
    notifications: notifier,
    whatsappWebhook: createWhatsappWebhookService({
      appSecret: WEBHOOK_APP_SECRET,
      verifyToken: WEBHOOK_VERIFY_TOKEN,
      jobs: notificationJobs,
      logger: silentLogger,
    }),
    ownerAuth,
    ownerMail: createOwnerMailService({ mail }),
    requireStaffAuth: createRequireStaffAuth(auth, cookie),
    requireOwnerAuth: createRequireOwnerAuth(ownerAuth, ownerCookie),
    cookie,
    ownerCookie,
    allowedOrigin: options.allowedOrigin,
  };

  return {
    app: createApp(dependencies),
    staff,
    sessions,
    lots,
    mail,
    audit,
    notifier,
    notificationJobs,
    ownerAuth,
    ownerSessions,
    ownerCookie,
  };
}
