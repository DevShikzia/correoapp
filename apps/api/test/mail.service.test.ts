import { describe, expect, it } from 'vitest';
import type { LotRecord } from '../src/modules/lots/lots.repository.js';
import { createMailService } from '../src/modules/mail/mail.service.js';
import { createMailSchema } from '../src/modules/mail/mail.validator.js';
import type { Actor } from '../src/shared/actor.js';
import { AppError } from '../src/shared/errors.js';
import {
  createAuditRepositoryFake,
  createLotRepositoryFake,
  createMailNotifierFake,
  createMailRepositoryFake,
} from './fakes.js';

const NOW = new Date('2026-05-10T15:00:00.000Z');
const guard: Actor = { id: 'staff-guard', role: 'guard' };
const admin: Actor = { id: 'staff-admin', role: 'admin' };

const activeLot: LotRecord = {
  id: 'lot-1',
  lotNumber: '42',
  ownerNames: ['Ana Pérez'],
  contacts: [{ name: 'Ana Pérez', phone: '+5491122334455' }],
  pinHash: 'pin-hash',
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const inactiveLot: LotRecord = { ...activeLot, id: 'lot-2', lotNumber: '43', active: false };

function buildService(lots: LotRecord[] = [activeLot, inactiveLot]) {
  const lotRepository = createLotRepositoryFake(lots);
  const mail = createMailRepositoryFake();
  const audit = createAuditRepositoryFake();
  const notifier = createMailNotifierFake();
  const service = createMailService({
    mail,
    lots: lotRepository,
    audit,
    notifier,
    now: () => NOW,
  });

  return { service, mail, audit, notifier };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('mailService.register', () => {
  it('registra la correspondencia a nombre del vigilador autenticado', async () => {
    const { service, mail, audit } = buildService();

    const item = await service.register(
      guard,
      { lotNumber: '42', description: 'Carta certificada' },
      'req-1',
    );

    expect(item).toMatchObject({
      lotNumber: '42',
      lotId: activeLot.id,
      description: 'Carta certificada',
      receivedBy: guard.id,
      status: 'pending',
      deliveredAt: null,
      deliveredBy: null,
    });
    expect(item.receivedAt).toEqual(NOW);
    expect(mail.records.get(item.id)?.receivedBy).toBe(guard.id);
    expect(audit.entries).toEqual([
      expect.objectContaining({
        actorType: 'staff',
        actorId: guard.id,
        action: 'mail.created',
        entityType: 'mailItem',
        entityId: item.id,
        lotId: activeLot.id,
        requestId: 'req-1',
      }),
    ]);
  });

  it('permite que un administrador también registre correspondencia', async () => {
    const { service } = buildService();

    const item = await service.register(admin, { lotNumber: '42' });

    expect(item.receivedBy).toBe(admin.id);
  });

  it('no incluye datos sensibles del lote en la respuesta', async () => {
    const { service } = buildService();

    const item = await service.register(guard, { lotNumber: '42' });

    expect(JSON.stringify(item)).not.toMatch(/pinHash|phone|ownerNames/i);
  });

  it('rechaza un lote inexistente o inactivo con el mismo mensaje', async () => {
    const { service, mail } = buildService();

    await expect(service.register(guard, { lotNumber: '999' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'El lote no existe o está inactivo.',
    });
    await expect(service.register(guard, { lotNumber: '43' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'El lote no existe o está inactivo.',
    });
    expect(mail.records.size).toBe(0);
  });

  it('rechaza una fecha de recepción futura', async () => {
    const { service, mail } = buildService();

    await expectAppError(
      service.register(guard, {
        lotNumber: '42',
        receivedAt: new Date(NOW.getTime() + 1),
      }),
      'VALIDATION_ERROR',
    );
    expect(mail.records.size).toBe(0);
  });

  it('acepta una fecha de recepción pasada', async () => {
    const { service } = buildService();
    const receivedAt = new Date('2026-05-09T10:00:00.000Z');

    const item = await service.register(guard, { lotNumber: '42', receivedAt });

    expect(item.receivedAt).toEqual(receivedAt);
  });

  it('normaliza una descripción vacía a null', async () => {
    const { service } = buildService();

    const item = await service.register(guard, { lotNumber: '42', description: '' });

    expect(item.description).toBeNull();
  });

  it('notifica al lote con los contactos configurados', async () => {
    const { service, notifier } = buildService();

    const item = await service.register(guard, { lotNumber: '42', description: 'Carta' });

    expect(notifier.inputs).toEqual([
      {
        mailItemId: item.id,
        lotId: activeLot.id,
        lotNumber: activeLot.lotNumber,
        contacts: activeLot.contacts,
      },
    ]);
  });

  it('guarda la correspondencia aunque la notificación falle', async () => {
    const { service, notifier, mail } = buildService();
    notifier.failNextCall();

    const item = await service.register(guard, { lotNumber: '42' });

    expect(item.id).toBeDefined();
    expect(mail.records.get(item.id)).toBeDefined();
  });
});

describe('mailService.listPending', () => {
  it('devuelve solo pendientes, del más antiguo al más nuevo', async () => {
    const { service } = buildService();

    const newest = await service.register(guard, {
      lotNumber: '42',
      receivedAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    const oldest = await service.register(guard, {
      lotNumber: '42',
      receivedAt: new Date('2026-05-09T12:00:00.000Z'),
    });
    const delivered = await service.register(guard, { lotNumber: '42' });
    await service.deliver(guard, delivered.id);

    const result = await service.listPending(guard, { page: 1, limit: 10 });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual([oldest.id, newest.id]);
  });

  it('pagina los resultados', async () => {
    const { service } = buildService();
    await service.register(guard, { lotNumber: '42' });
    await service.register(guard, { lotNumber: '42' });
    await service.register(guard, { lotNumber: '42' });

    const result = await service.listPending(guard, { page: 2, limit: 2 });

    expect(result.items).toHaveLength(1);
    expect(result).toMatchObject({ page: 2, limit: 2, total: 3 });
  });
});

describe('mailService.deliver', () => {
  it('marca la entrega con usuario y fecha, y audita el cambio', async () => {
    const { service, mail, audit } = buildService();
    const item = await service.register(guard, { lotNumber: '42' });

    const delivered = await service.deliver(admin, item.id, 'req-2');

    expect(delivered).toMatchObject({
      status: 'delivered',
      deliveredAt: NOW,
      deliveredBy: admin.id,
    });
    expect(mail.records.get(item.id)?.status).toBe('delivered');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'mail.delivered',
      actorId: admin.id,
      entityId: item.id,
      lotId: activeLot.id,
      requestId: 'req-2',
    });
  });

  it('no permite entregar dos veces la misma correspondencia', async () => {
    const { service, audit } = buildService();
    const item = await service.register(guard, { lotNumber: '42' });
    await service.deliver(guard, item.id);
    const auditsAfterFirstDelivery = audit.entries.length;

    await expect(service.deliver(guard, item.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'La correspondencia ya fue entregada.',
    });
    expect(audit.entries).toHaveLength(auditsAfterFirstDelivery);
  });

  it('responde conflicto si otra entrega ganó la carrera', async () => {
    const { service, mail, audit } = buildService();
    const item = await service.register(guard, { lotNumber: '42' });
    mail.failNextDeliveryWithConflict();

    await expectAppError(service.deliver(guard, item.id), 'CONFLICT');
    expect(mail.records.get(item.id)?.status).toBe('pending');
    expect(audit.entries.filter((entry) => entry.action === 'mail.delivered')).toHaveLength(0);
  });

  it('devuelve NOT_FOUND si la correspondencia no existe', async () => {
    const { service } = buildService();

    await expectAppError(service.deliver(guard, 'mail-inexistente'), 'NOT_FOUND');
  });
});

describe('mailService.getById', () => {
  it('devuelve la correspondencia por id', async () => {
    const { service } = buildService();
    const item = await service.register(guard, { lotNumber: '42' });

    await expect(service.getById(guard, item.id)).resolves.toMatchObject({ id: item.id });
  });

  it('devuelve NOT_FOUND si no existe', async () => {
    const { service } = buildService();

    await expectAppError(service.getById(guard, 'mail-inexistente'), 'NOT_FOUND');
  });
});

describe('createMailSchema', () => {
  it('rechaza una descripción demasiado larga', () => {
    const result = createMailSchema.safeParse({
      lotNumber: '42',
      description: 'x'.repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it('rechaza un número de lote inválido', () => {
    expect(createMailSchema.safeParse({ lotNumber: 'abc' }).success).toBe(false);
    expect(createMailSchema.safeParse({ lotNumber: '' }).success).toBe(false);
  });

  it('rechaza una fecha inválida', () => {
    expect(createMailSchema.safeParse({ lotNumber: '42', receivedAt: 'no-es-fecha' }).success).toBe(
      false,
    );
  });
});
