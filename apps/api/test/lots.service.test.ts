import { describe, expect, it } from 'vitest';
import { createLotsService } from '../src/modules/lots/lots.service.js';
import type { Actor } from '../src/shared/actor.js';
import { AppError } from '../src/shared/errors.js';
import { createAuditRepositoryFake, createLotRepositoryFake } from './fakes.js';

const admin: Actor = { id: 'staff-1', role: 'admin' };
const guard: Actor = { id: 'staff-2', role: 'guard' };

const NEW_LOT = {
  lotNumber: '42',
  ownerNames: ['Ana Pérez'],
  contacts: [{ name: 'Ana Pérez', phone: '+5491122334455' }],
  pin: '1234',
};

function buildService() {
  const lots = createLotRepositoryFake();
  const audit = createAuditRepositoryFake();
  const service = createLotsService({
    lots,
    audit,
    hashPin: (pin) => Promise.resolve(`hash:${pin}`),
  });

  return { service, lots, audit };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('lotsService.create', () => {
  it('solo permite crear lotes a un administrador', async () => {
    const { service, lots } = buildService();

    await expectAppError(service.create(guard, NEW_LOT), 'FORBIDDEN');

    expect(lots.records.size).toBe(0);
  });

  it('guarda el PIN hasheado y audita la creación', async () => {
    const { service, lots, audit } = buildService();

    const lot = await service.create(admin, NEW_LOT, 'req-1');

    expect(lots.records.get(lot.id)?.pinHash).toBe('hash:1234');
    expect(audit.entries).toEqual([
      expect.objectContaining({
        actorType: 'staff',
        actorId: admin.id,
        action: 'lot.created',
        entityType: 'lot',
        lotId: lot.id,
        requestId: 'req-1',
      }),
    ]);
  });

  it('nunca devuelve el hash del PIN en el DTO', async () => {
    const { service } = buildService();

    const lot = await service.create(admin, NEW_LOT);

    expect(lot).not.toHaveProperty('pinHash');
    expect(JSON.stringify(lot)).not.toContain('hash:1234');
  });

  it('rechaza un número de lote duplicado', async () => {
    const { service } = buildService();
    await service.create(admin, NEW_LOT);

    await expectAppError(service.create(admin, NEW_LOT), 'CONFLICT');
  });

  it('traduce la violación del índice único a un conflicto', async () => {
    const { service, lots } = buildService();
    lots.failNextCreateWithDuplicateKey();

    await expectAppError(service.create(admin, NEW_LOT), 'CONFLICT');
  });
});

describe('lotsService.list', () => {
  it('devuelve una lista paginada sin hashes', async () => {
    const { service } = buildService();
    await service.create(admin, { ...NEW_LOT, lotNumber: '1' });
    await service.create(admin, { ...NEW_LOT, lotNumber: '2' });

    const result = await service.list(admin, { page: 1, limit: 1 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result.items)).not.toContain('hash:');
  });

  it('no permite listar a un vigilador', async () => {
    const { service } = buildService();

    await expectAppError(service.list(guard, { page: 1, limit: 20 }), 'FORBIDDEN');
  });
});

describe('lotsService.resetPin', () => {
  it('reemplaza el hash del PIN y audita el cambio', async () => {
    const { service, lots, audit } = buildService();
    const lot = await service.create(admin, NEW_LOT);

    await service.resetPin(admin, lot.id, '9999');

    expect(lots.records.get(lot.id)?.pinHash).toBe('hash:9999');
    expect(audit.entries.at(-1)).toMatchObject({ action: 'lot.pin_reset', lotId: lot.id });
  });

  it('devuelve NOT_FOUND si el lote no existe', async () => {
    const { service } = buildService();

    await expectAppError(service.resetPin(admin, 'inexistente', '9999'), 'NOT_FOUND');
  });

  it('no permite resetear el PIN a un vigilador', async () => {
    const { service } = buildService();
    const lot = await service.create(admin, NEW_LOT);

    await expectAppError(service.resetPin(guard, lot.id, '9999'), 'FORBIDDEN');
  });
});
