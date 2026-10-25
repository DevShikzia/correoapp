import { createApp } from '../src/app.js';
import type { AppDependencies } from '../src/dependencies.js';
import { LOGIN_MAX_ATTEMPTS } from '../src/modules/auth/auth.constants.js';
import { createRequireStaffAuth } from '../src/modules/auth/auth.middleware.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';
import { createLotsService } from '../src/modules/lots/lots.service.js';
import type { LotRecord } from '../src/modules/lots/lots.repository.js';
import { createMailService } from '../src/modules/mail/mail.service.js';
import type { StaffUserRecord } from '../src/modules/staff/staff.repository.js';
import { createStaffService } from '../src/modules/staff/staff.service.js';
import {
  createAuditRepositoryFake,
  createLotRepositoryFake,
  createMailRepositoryFake,
  createStaffRepositoryFake,
  createStaffSessionsRepositoryFake,
} from './fakes.js';

export const ADMIN_PASSWORD = 'contrasena-admin-123';
export const GUARD_PASSWORD = 'contrasena-guard-123';
export const ADMIN_ORIGIN = 'http://localhost:4200';

const FIXED_NOW = new Date('2026-03-01T12:00:00.000Z');

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

const activeLot: LotRecord = {
  id: 'lot-42',
  lotNumber: '42',
  ownerNames: ['Ana Pérez'],
  contacts: [{ name: 'Ana Pérez', phone: '+5491122334455' }],
  pinHash: 'pin-hash',
  active: true,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const inactiveLot: LotRecord = {
  ...activeLot,
  id: 'lot-43',
  lotNumber: '43',
  active: false,
};

export function buildTestApp(options: { allowedOrigin?: string } = {}) {
  const staff = createStaffRepositoryFake([adminRecord, guardRecord, inactiveRecord]);
  const sessions = createStaffSessionsRepositoryFake();
  const audit = createAuditRepositoryFake();
  const lots = createLotRepositoryFake([activeLot, inactiveLot]);
  const mail = createMailRepositoryFake();
  const cookie = { secureCookies: false, sessionTtlMs: 60_000 };

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

  const dependencies: AppDependencies = {
    auth,
    lots: createLotsService({
      lots,
      audit,
      hashPin: (pin) => Promise.resolve(`pin:${pin}`),
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
      now: () => FIXED_NOW,
    }),
    requireStaffAuth: createRequireStaffAuth(auth, cookie),
    cookie,
    allowedOrigin: options.allowedOrigin,
  };

  return { app: createApp(dependencies), staff, sessions, lots, mail, audit };
}
