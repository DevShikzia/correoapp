import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { NotificationJobRecord } from '../src/modules/notifications/notification.repository.js';
import { WEBHOOK_APP_SECRET, WEBHOOK_VERIFY_TOKEN, buildTestApp } from './test-app.js';

const NOTIFICATION: NotificationJobRecord = {
  id: 'notification-1',
  mailItemId: 'mail-1',
  lotId: 'lot-42',
  lotNumber: '42',
  phone: '+5491122334455',
  status: 'sent',
  attempts: 1,
  providerMessageId: 'wamid.1',
  providerStatus: 'sent',
  lastErrorCode: null,
  sentAt: new Date('2026-03-01T12:00:00.000Z'),
  createdAt: new Date('2026-03-01T11:59:00.000Z'),
  updatedAt: new Date('2026-03-01T12:00:00.000Z'),
};

function sign(body: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_APP_SECRET).update(body).digest('hex')}`;
}

function statusPayload(id: string, status: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'account-1',
        changes: [{ field: 'messages', value: { statuses: [{ id, status }] } }],
      },
    ],
  });
}

describe('GET /api/webhooks/whatsapp', () => {
  it('devuelve el challenge con el token correcto', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get(
      `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${WEBHOOK_VERIFY_TOKEN}&hub.challenge=12345`,
    );

    expect(response.status).toBe(200);
    expect(response.text).toBe('12345');
  });

  it('rechaza un token de verificación incorrecto', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get(
      '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=12345',
    );

    expect(response.status).toBe(403);
  });
});

describe('POST /api/webhooks/whatsapp', () => {
  it('actualiza el estado usando la firma HMAC, sin Origin', async () => {
    const { app, notificationJobs } = buildTestApp({ notifications: [NOTIFICATION] });
    const body = statusPayload('wamid.1', 'delivered');

    const response = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(response.status).toBe(200);
    expect(notificationJobs.records.get(NOTIFICATION.id)).toMatchObject({
      status: 'sent',
      providerStatus: 'delivered',
      lastErrorCode: null,
    });
  });

  it('rechaza una firma inválida y no modifica el aviso', async () => {
    const { app, notificationJobs } = buildTestApp({ notifications: [NOTIFICATION] });
    const body = statusPayload('wamid.1', 'delivered');

    const response = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', `sha256=${'0'.repeat(64)}`)
      .send(body);

    expect(response.status).toBe(401);
    expect(notificationJobs.records.get(NOTIFICATION.id)?.providerStatus).toBe('sent');
  });

  it('marca el aviso como fallido con el código del proveedor', async () => {
    const { app, notificationJobs } = buildTestApp({ notifications: [NOTIFICATION] });
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.1',
                    status: 'failed',
                    errors: [{ code: 131026, title: 'Undeliverable' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const response = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(response.status).toBe(200);
    expect(notificationJobs.records.get(NOTIFICATION.id)).toMatchObject({
      status: 'failed',
      providerStatus: 'failed',
      lastErrorCode: '131026',
    });
  });

  it('rechaza un cuerpo ilegible aunque la firma sea válida', async () => {
    const { app } = buildTestApp();
    const body = '{no-es-json';

    const response = await request(app)
      .post('/api/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(response.status).toBe(400);
  });
});
