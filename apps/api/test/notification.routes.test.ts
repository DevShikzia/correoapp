import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { NotificationJobRecord } from '../src/modules/notifications/notification.repository.js';
import {
  ADMIN_PASSWORD,
  GUARD_PASSWORD,
  adminRecord,
  buildTestApp,
  guardRecord,
} from './test-app.js';

const NOW = new Date('2026-05-10T15:00:00.000Z');
const PHONE = '+5491122334455';

function buildNotification(overrides: Partial<NotificationJobRecord> = {}): NotificationJobRecord {
  return {
    id: 'notification-1',
    mailItemId: 'mail-1',
    lotId: 'lot-42',
    lotNumber: '42',
    phone: PHONE,
    status: 'failed',
    attempts: 3,
    retryCount: 0,
    providerMessageId: null,
    providerStatus: null,
    lastErrorCode: 'HTTP_503',
    sentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function loginAsAdmin(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/login')
    .send({ username: adminRecord.username, password: ADMIN_PASSWORD })
    .expect(200);

  return agent;
}

async function loginAsGuard(app: ReturnType<typeof buildTestApp>['app']) {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/login')
    .send({ username: guardRecord.username, password: GUARD_PASSWORD })
    .expect(200);

  return agent;
}

describe('GET /api/notifications', () => {
  it('lista los avisos con el teléfono enmascarado', async () => {
    const { app } = buildTestApp({
      notifications: [
        buildNotification(),
        buildNotification({ id: 'notification-2', status: 'sent', sentAt: NOW }),
      ],
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.get('/api/notifications');

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ page: 1, total: 2 });
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toMatchObject({ phoneMasked: '+549••••4455' });
    expect(JSON.stringify(response.body)).not.toContain(PHONE);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('filtra por estado', async () => {
    const { app } = buildTestApp({
      notifications: [
        buildNotification(),
        buildNotification({ id: 'notification-2', status: 'sent', sentAt: NOW }),
      ],
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.get('/api/notifications?status=sent');

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0].id).toBe('notification-2');
  });

  it('rechaza un estado desconocido', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsAdmin(app);

    const response = await agent.get('/api/notifications?status=desconocido');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza a un vigilador', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsGuard(app);

    await agent.get('/api/notifications').expect(403);
  });

  it('exige sesión', async () => {
    const { app } = buildTestApp();

    await request(app).get('/api/notifications').expect(401);
  });
});

describe('POST /api/notifications/:id/retry', () => {
  it('reencola un aviso fallido y registra la auditoría', async () => {
    const { app, audit, enqueuedNotifications } = buildTestApp({
      notifications: [buildNotification()],
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/notifications/notification-1/retry');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 'notification-1',
      status: 'queued',
      attempts: 0,
      retryCount: 1,
    });
    expect(enqueuedNotifications).toEqual([{ id: 'notification-1', retryCount: 1 }]);
    expect(audit.entries.map((entry) => entry.action)).toEqual(['notification.retried']);
  });

  it('devuelve 409 si el aviso ya fue enviado', async () => {
    const { app, enqueuedNotifications } = buildTestApp({
      notifications: [buildNotification({ status: 'sent', sentAt: NOW })],
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/notifications/notification-1/retry');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('El aviso ya fue enviado.');
    expect(enqueuedNotifications).toHaveLength(0);
  });

  it('devuelve 404 si el aviso no existe', async () => {
    const { app } = buildTestApp();
    const agent = await loginAsAdmin(app);

    await agent.post('/api/notifications/notification-inexistente/retry').expect(404);
  });

  it('rechaza a un vigilador', async () => {
    const { app } = buildTestApp({ notifications: [buildNotification()] });
    const agent = await loginAsGuard(app);

    await agent.post('/api/notifications/notification-1/retry').expect(403);
  });

  it('deja el aviso pendiente y responde 503 si la cola falla', async () => {
    const { app, notificationJobs, failNotificationQueue } = buildTestApp({
      notifications: [buildNotification()],
    });
    failNotificationQueue();
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/notifications/notification-1/retry');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(notificationJobs.records.get('notification-1')).toMatchObject({
      status: 'pending',
      retryCount: 1,
    });
  });

  it('rechaza el reintento si las notificaciones están deshabilitadas', async () => {
    const { app } = buildTestApp({
      notifications: [buildNotification()],
      notificationsEnabled: false,
    });
    const agent = await loginAsAdmin(app);

    const response = await agent.post('/api/notifications/notification-1/retry');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Las notificaciones están deshabilitadas.');
  });

  it('exige sesión', async () => {
    const { app } = buildTestApp();

    await request(app).post('/api/notifications/notification-1/retry').expect(401);
  });
});
