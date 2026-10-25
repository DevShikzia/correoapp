import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_PASSWORD,
  GUARD_PASSWORD,
  adminRecord,
  buildTestApp,
  guardRecord,
} from './test-app.js';

async function loginAsGuard(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/login')
    .send({ username: guardRecord.username, password: GUARD_PASSWORD })
    .expect(200);

  return agent;
}

async function loginAsAdmin(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/login')
    .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
    .expect(200);

  return agent;
}

describe('POST /api/mail', () => {
  it('registra correspondencia y la deja pendiente', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const response = await agent
      .post('/api/mail')
      .send({ lotNumber: '42', description: 'Carta certificada' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      lotNumber: '42',
      lotId: 'lot-42',
      description: 'Carta certificada',
      receivedBy: guardRecord.id,
      status: 'pending',
      deliveredAt: null,
      deliveredBy: null,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/pinHash|phone|ownerNames/i);
  });

  it('ignora un receivedBy enviado por el cliente', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const response = await agent
      .post('/api/mail')
      .send({ lotNumber: '42', receivedBy: adminRecord.id });

    expect(response.status).toBe(201);
    expect(response.body.data.receivedBy).toBe(guardRecord.id);
  });

  it('rechaza un lote inactivo o inexistente sin distinguirlos', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const inactive = await agent.post('/api/mail').send({ lotNumber: '43' });
    const unknown = await agent.post('/api/mail').send({ lotNumber: '999' });

    expect(inactive.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(inactive.body.error).toEqual(unknown.body.error);
    expect(inactive.body.error.message).toBe('El lote no existe o está inactivo.');
  });

  it('rechaza una fecha de recepción futura', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const response = await agent
      .post('/api/mail')
      .send({ lotNumber: '42', receivedAt: '2027-01-01T00:00:00.000Z' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('La fecha de recepción no puede ser futura.');
  });

  it('rechaza una descripción demasiado larga', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const response = await agent
      .post('/api/mail')
      .send({ lotNumber: '42', description: 'x'.repeat(201) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza la petición sin sesión', async () => {
    const { app } = buildTestApp();

    await request(app).post('/api/mail').send({ lotNumber: '42' }).expect(401);
  });
});

describe('GET /api/mail/pending', () => {
  it('lista solo los pendientes', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);
    await agent.post('/api/mail').send({ lotNumber: '42' }).expect(201);
    const second = await agent.post('/api/mail').send({ lotNumber: '42' }).expect(201);

    await agent.patch(`/api/mail/${second.body.data.id}/deliver`).expect(200);

    const response = await agent.get('/api/mail/pending');

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, total: 1 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('pending');
  });

  it('exige sesión', async () => {
    const { app } = buildTestApp();

    await request(app).get('/api/mail/pending').expect(401);
  });
});

describe('GET /api/mail/:id', () => {
  it('devuelve la correspondencia registrada', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);
    const created = await agent
      .post('/api/mail')
      .send({ lotNumber: '42', description: 'Paquete' })
      .expect(201);

    const response = await agent.get(`/api/mail/${created.body.data.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.description).toBe('Paquete');
  });

  it('devuelve 404 sin filtrar datos internos', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    const response = await agent.get('/api/mail/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'La correspondencia no existe.' },
    });
  });
});

describe('PATCH /api/mail/:id/deliver', () => {
  it('marca la entrega con el usuario autenticado', async () => {
    const { app, audit } = buildTestApp();
    const agent = await loginAsAdmin(app);
    const created = await agent.post('/api/mail').send({ lotNumber: '42' }).expect(201);

    const response = await agent.patch(`/api/mail/${created.body.data.id}/deliver`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'delivered',
      deliveredBy: adminRecord.id,
    });
    expect(response.body.data.deliveredAt).not.toBeNull();
    expect(audit.entries.map((entry) => entry.action)).toEqual(['mail.created', 'mail.delivered']);
  });

  it('impide una segunda entrega', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);
    const created = await agent.post('/api/mail').send({ lotNumber: '42' }).expect(201);
    await agent.patch(`/api/mail/${created.body.data.id}/deliver`).expect(200);

    const second = await agent.patch(`/api/mail/${created.body.data.id}/deliver`);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: { code: 'CONFLICT', message: 'La correspondencia ya fue entregada.' },
    });
  });

  it('devuelve 404 si la correspondencia no existe', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    await agent.patch('/api/mail/no-existe/deliver').expect(404);
  });

  it('exige sesión', async () => {
    const { app } = buildTestApp();

    await request(app).patch('/api/mail/mail-1/deliver').expect(401);
  });
});
