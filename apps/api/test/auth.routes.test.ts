import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppDependencies } from '../src/dependencies.js';
import {
  GENERIC_LOGIN_ERROR_MESSAGE,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MESSAGE,
} from '../src/modules/auth/auth.constants.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createRequireStaffAuth } from '../src/modules/auth/auth.middleware.js';
import { createAttemptLimiter } from '../src/modules/auth/login-rate-limit.js';
import type { StaffUserRecord } from '../src/modules/staff/staff.repository.js';
import { createStaffService } from '../src/modules/staff/staff.service.js';
import { createLotsService } from '../src/modules/lots/lots.service.js';
import {
  createAuditRepositoryFake,
  createLotRepositoryFake,
  createStaffRepositoryFake,
  createStaffSessionsRepositoryFake,
} from './fakes.js';

const ADMIN_PASSWORD = 'contrasena-admin-123';
const GUARD_PASSWORD = 'contrasena-guard-123';
const ADMIN_ORIGIN = 'http://localhost:4200';

const adminRecord: StaffUserRecord = {
  id: 'staff-admin',
  username: 'admin.uno',
  passwordHash: `hash:${ADMIN_PASSWORD}`,
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const guardRecord: StaffUserRecord = {
  ...adminRecord,
  id: 'staff-guard',
  username: 'vigilante.uno',
  passwordHash: `hash:${GUARD_PASSWORD}`,
  role: 'guard',
};

const inactiveRecord: StaffUserRecord = {
  ...guardRecord,
  id: 'staff-inactive',
  username: 'vigilante.inactivo',
  active: false,
};

function buildTestApp(options: { allowedOrigin?: string } = {}) {
  const staff = createStaffRepositoryFake([adminRecord, guardRecord, inactiveRecord]);
  const sessions = createStaffSessionsRepositoryFake();
  const audit = createAuditRepositoryFake();
  const lots = createLotRepositoryFake();
  const cookie = { secureCookies: false, sessionTtlMs: 60_000 };

  const auth = createAuthService({
    staff,
    sessions,
    limiter: createAttemptLimiter({
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      windowMs: 60_000,
      now: () => new Date('2026-03-01T12:00:00.000Z'),
    }),
    verifyPassword: (passwordHash, password) =>
      Promise.resolve(passwordHash === `hash:${password}`),
    createToken: () => `token-${sessions.records.size + 1}-${Math.random()}`,
    hashToken: (token) => `sha256:${token}`,
    now: () => new Date('2026-03-01T12:00:00.000Z'),
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
    requireStaffAuth: createRequireStaffAuth(auth, cookie),
    cookie,
    allowedOrigin: options.allowedOrigin,
  };

  return { app: createApp(dependencies), staff, sessions, lots, audit };
}

const NEW_LOT = {
  lotNumber: '42',
  ownerNames: ['Ana Pérez'],
  contacts: [{ name: 'Ana Pérez', phone: '+5491122334455' }],
  pin: '1234',
};

describe('POST /api/auth/login', () => {
  it('inicia sesión con una cookie HttpOnly y SameSite estricta', async () => {
    const { app, staff } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: adminRecord.id,
      username: adminRecord.username,
      role: 'admin',
    });
    expect(JSON.stringify(response.body)).not.toContain('hash:');

    const cookieHeader = String(response.headers['set-cookie']);
    expect(cookieHeader).toContain('staff_session=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(cookieHeader).toContain('Path=/');
    expect(staff.records.get(adminRecord.id)?.lastLoginAt).not.toBeNull();
  });

  it('responde con un error genérico ante credenciales inválidas', async () => {
    const { app, sessions } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: 'incorrecta' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: GENERIC_LOGIN_ERROR_MESSAGE },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessions.records.size).toBe(0);
  });

  it('rechaza usuarios inactivos con el mismo mensaje', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: inactiveRecord.username, password: GUARD_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe(GENERIC_LOGIN_ERROR_MESSAGE);
  });

  it('valida el cuerpo de la petición', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: '', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza un JSON inválido sin exponer detalles internos', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'El cuerpo de la petición no es válido.' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/syntaxerror|stack/i);
  });

  it('limita los intentos fallidos', async () => {
    const { app } = buildTestApp();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: adminRecord.username, password: 'incorrecta' });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: LOGIN_RATE_LIMIT_MESSAGE },
    });
  });
});

describe('sesiones de vigiladores', () => {
  it('devuelve el usuario autenticado en /api/auth/me', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);

    const response = await agent.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.user.username).toBe(adminRecord.username);
  });

  it('cierra la sesión y la revoca en el servidor', async () => {
    const { app, sessions } = buildTestApp();
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);
    expect(sessions.records.size).toBe(1);

    const logout = await agent.post('/api/auth/logout');

    expect(logout.status).toBe(204);
    expect(sessions.records.size).toBe(0);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rechaza rutas protegidas sin cookie', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/lots');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza una cookie con un token desconocido', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .get('/api/lots')
      .set('Cookie', 'staff_session=token-inventado');

    expect(response.status).toBe(401);
  });

  it('invalida la sesión cuando el usuario es desactivado', async () => {
    const { app } = buildTestApp();
    const admin = request.agent(app);
    const guard = request.agent(app);

    await admin
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);
    await guard
      .post('/api/auth/login')
      .send({ username: guardRecord.username, password: GUARD_PASSWORD })
      .expect(200);

    await admin.patch(`/api/staff/${guardRecord.id}`).send({ active: false }).expect(200);

    await guard.get('/api/auth/me').expect(401);
  });
});

describe('autorización por rol en las rutas', () => {
  it('un vigilador no puede administrar lotes ni usuarios', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ username: guardRecord.username, password: GUARD_PASSWORD })
      .expect(200);

    const lots = await agent.get('/api/lots');
    expect(lots.status).toBe(403);
    expect(lots.body.error.code).toBe('FORBIDDEN');

    const staff = await agent.get('/api/staff');
    expect(staff.status).toBe(403);

    const created = await agent.post('/api/lots').send(NEW_LOT);
    expect(created.status).toBe(403);
  });

  it('un administrador puede consultar y crear lotes', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);

    const empty = await agent.get('/api/lots');
    expect(empty.status).toBe(200);
    expect(empty.body.meta.total).toBe(0);

    const created = await agent.post('/api/lots').send(NEW_LOT);
    expect(created.status).toBe(201);
    expect(created.body.data.lotNumber).toBe(NEW_LOT.lotNumber);
    expect(JSON.stringify(created.body)).not.toContain('pin:');

    const listed = await agent.get('/api/lots');
    expect(listed.body.meta.total).toBe(1);
  });

  it('mantiene las respuestas privadas fuera de caché', async () => {
    const { app } = buildTestApp();
    const agent = request.agent(app);

    await agent
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);

    const response = await agent.get('/api/lots');

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('guard de origen', () => {
  it('bloquea peticiones que modifican datos desde otro origen', async () => {
    const { app } = buildTestApp({ allowedOrigin: ADMIN_ORIGIN });

    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://sitio-malicioso.test')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('acepta el origen configurado y no bloquea lecturas', async () => {
    const { app } = buildTestApp({ allowedOrigin: ADMIN_ORIGIN });

    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD });

    expect(login.status).toBe(200);

    const health = await request(app).get('/api/health').set('Origin', 'http://otro.test');
    expect(health.status).toBe(200);
  });
});
