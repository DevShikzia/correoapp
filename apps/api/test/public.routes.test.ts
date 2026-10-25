import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { MailItemRecord } from '../src/modules/mail/mail.repository.js';
import {
  OWNER_ACCESS_MAX_ATTEMPTS,
  OWNER_GENERIC_ERROR_MESSAGE,
  OWNER_RATE_LIMIT_MESSAGE,
} from '../src/modules/public/public.constants.js';
import {
  ADMIN_PASSWORD,
  OWNER_PIN,
  activeLot,
  adminRecord,
  buildTestApp,
  inactiveLot,
} from './test-app.js';

const otherLot = {
  ...activeLot,
  id: 'lot-44',
  lotNumber: '44',
};

const RECEIVED_AT = new Date('2026-03-01T10:00:00.000Z');

function mailRecord(
  overrides: Partial<MailItemRecord> &
    Pick<MailItemRecord, 'id' | 'lotId' | 'lotNumber' | 'description'>,
): MailItemRecord {
  return {
    receivedAt: RECEIVED_AT,
    receivedBy: 'staff-guard',
    status: 'pending',
    deliveredAt: null,
    deliveredBy: null,
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
    ...overrides,
  };
}

async function loginOwner(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);

  await agent
    .post('/api/public/access')
    .send({ lotNumber: activeLot.lotNumber, pin: OWNER_PIN })
    .expect(200);

  return agent;
}

describe('POST /api/public/access', () => {
  it('inicia sesión con una cookie HttpOnly y SameSite estricta', async () => {
    const { app, ownerSessions } = buildTestApp();

    const response = await request(app)
      .post('/api/public/access')
      .send({ lotNumber: activeLot.lotNumber, pin: OWNER_PIN });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      lotNumber: activeLot.lotNumber,
      expiresAt: '2026-03-01T12:30:00.000Z',
    });

    const cookieHeader = String(response.headers['set-cookie']);
    expect(cookieHeader).toContain('owner_session=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(cookieHeader).toContain('Path=/');
    expect(ownerSessions.records.size).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(/pinHash|phone|ownerNames|lote-42/i);
  });

  it('responde con un error genérico ante lote o PIN inválidos', async () => {
    const { app, ownerSessions } = buildTestApp();

    const wrongPin = await request(app)
      .post('/api/public/access')
      .send({ lotNumber: activeLot.lotNumber, pin: '9999' });
    const unknownLot = await request(app)
      .post('/api/public/access')
      .send({ lotNumber: '999', pin: OWNER_PIN });
    const inactive = await request(app)
      .post('/api/public/access')
      .send({ lotNumber: inactiveLot.lotNumber, pin: OWNER_PIN });

    for (const response of [wrongPin, unknownLot, inactive]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: OWNER_GENERIC_ERROR_MESSAGE },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(ownerSessions.records.size).toBe(0);
  });

  it('valida el cuerpo de la petición', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/public/access').send({ lotNumber: '', pin: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('limita los intentos fallidos', async () => {
    const { app } = buildTestApp();

    for (let attempt = 0; attempt < OWNER_ACCESS_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .post('/api/public/access')
        .send({ lotNumber: activeLot.lotNumber, pin: '9999' });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app)
      .post('/api/public/access')
      .send({ lotNumber: activeLot.lotNumber, pin: OWNER_PIN });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'TOO_MANY_REQUESTS', message: OWNER_RATE_LIMIT_MESSAGE },
    });
  });
});

describe('sesión de propietario', () => {
  it('devuelve el número de lote de la sesión en /api/public/me', async () => {
    const { app } = buildTestApp();
    const owner = await loginOwner(app);

    const response = await owner.get('/api/public/me');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ lotNumber: activeLot.lotNumber });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('exige sesión de propietario', async () => {
    const { app } = buildTestApp();

    await request(app).get('/api/public/me').expect(401);
  });

  it('no acepta la cookie de un vigilador', async () => {
    const { app } = buildTestApp();
    const staff = request.agent(app);

    await staff
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);

    await staff.get('/api/public/me').expect(401);
    await staff.get('/api/public/mail').expect(401);
  });

  it('rechaza una cookie con un token desconocido', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .get('/api/public/me')
      .set('Cookie', 'owner_session=token-inventado');

    expect(response.status).toBe(401);
  });

  it('rechaza una sesión vencida', async () => {
    const { app, ownerSessions } = buildTestApp();
    ownerSessions.records.set('owner-session-1', {
      id: 'owner-session-1',
      tokenHash: 'sha256:vencido',
      lotId: activeLot.id,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app)
      .get('/api/public/me')
      .set('Cookie', 'owner_session=vencido');

    expect(response.status).toBe(401);
  });

  it('cierra la sesión y la revoca en el servidor', async () => {
    const { app, ownerSessions } = buildTestApp();
    const owner = await loginOwner(app);
    expect(ownerSessions.records.size).toBe(1);

    const logout = await owner.post('/api/public/logout');

    expect(logout.status).toBe(204);
    expect(ownerSessions.records.size).toBe(0);
    await owner.get('/api/public/me').expect(401);
  });

  it('invalida la sesión cuando un administrador desactiva el lote', async () => {
    const { app, ownerSessions } = buildTestApp();
    const owner = await loginOwner(app);
    const admin = request.agent(app);

    await admin
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);
    await admin.patch(`/api/lots/${activeLot.id}`).send({ active: false }).expect(200);

    expect(ownerSessions.records.size).toBe(0);
    await owner.get('/api/public/me').expect(401);
  });

  it('invalida la sesión cuando un administrador resetea el PIN', async () => {
    const { app, ownerSessions } = buildTestApp();
    const owner = await loginOwner(app);
    const admin = request.agent(app);

    await admin
      .post('/api/auth/login')
      .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
      .expect(200);
    await admin.post(`/api/lots/${activeLot.id}/reset-pin`).send({ pin: '5678' }).expect(204);

    expect(ownerSessions.records.size).toBe(0);
    await owner.get('/api/public/me').expect(401);
  });
});

describe('GET /api/public/mail', () => {
  it('lista solo la correspondencia del lote de la sesión', async () => {
    const { app } = buildTestApp({
      lots: [activeLot, inactiveLot, otherLot],
      mail: [
        mailRecord({
          id: 'mail-1',
          lotId: activeLot.id,
          lotNumber: activeLot.lotNumber,
          description: 'Carta del lote 42',
        }),
        mailRecord({
          id: 'mail-2',
          lotId: otherLot.id,
          lotNumber: otherLot.lotNumber,
          description: 'Carta del lote 44',
        }),
      ],
    });
    const owner = await loginOwner(app);

    const response = await owner.get('/api/public/mail?lotId=lot-44&lotNumber=44');

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, total: 1 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      description: 'Carta del lote 42',
      status: 'pending',
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /lotId|lotNumber|receivedBy|deliveredBy|phone/i,
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('exige sesión de propietario', async () => {
    const { app } = buildTestApp();

    await request(app).get('/api/public/mail').expect(401);
  });
});
