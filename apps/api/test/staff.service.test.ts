import { describe, expect, it } from 'vitest';
import { createStaffService } from '../src/modules/staff/staff.service.js';
import type { StaffUserRecord } from '../src/modules/staff/staff.repository.js';
import type { Actor } from '../src/shared/actor.js';
import { AppError } from '../src/shared/errors.js';
import {
  createAuditRepositoryFake,
  createStaffRepositoryFake,
  createStaffSessionsRepositoryFake,
} from './fakes.js';

const admin: Actor = { id: 'staff-0', role: 'admin' };
const guard: Actor = { id: 'staff-9', role: 'guard' };

const NEW_GUARD = {
  username: 'vigilante.uno',
  password: 'contrasena-larga-123',
  role: 'guard' as const,
};

function buildService(seed: StaffUserRecord[] = []) {
  const staff = createStaffRepositoryFake(seed);
  const audit = createAuditRepositoryFake();
  const sessions = createStaffSessionsRepositoryFake();
  const service = createStaffService({
    staff,
    audit,
    sessions,
    hashPassword: (password) => Promise.resolve(`hash:${password}`),
  });

  return { service, staff, audit, sessions };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('staffService.create', () => {
  it('solo permite crear usuarios a un administrador', async () => {
    const { service, staff } = buildService();

    await expectAppError(service.create(guard, NEW_GUARD), 'FORBIDDEN');

    expect(staff.records.size).toBe(0);
  });

  it('guarda el hash de la contraseña y audita', async () => {
    const { service, staff, audit } = buildService();

    const created = await service.create(admin, NEW_GUARD);

    expect(staff.records.get(created.id)?.passwordHash).toBe(`hash:${NEW_GUARD.password}`);
    expect(audit.entries).toEqual([
      expect.objectContaining({ action: 'staff.created', entityId: created.id }),
    ]);
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    const { service } = buildService();

    const created = await service.create(admin, NEW_GUARD);

    expect(created).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(created)).not.toContain('hash:');
  });

  it('rechaza un nombre de usuario duplicado', async () => {
    const { service } = buildService();
    await service.create(admin, NEW_GUARD);

    await expectAppError(service.create(admin, NEW_GUARD), 'CONFLICT');
  });
});

describe('staffService.update', () => {
  const otherAdmin: StaffUserRecord = {
    id: 'staff-1',
    username: 'admin.dos',
    passwordHash: 'hash:x',
    role: 'admin',
    active: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('impide que un administrador modifique su propio usuario', async () => {
    const selfAdmin: StaffUserRecord = {
      ...otherAdmin,
      id: admin.id,
      username: 'admin.uno',
    };
    const { service } = buildService([selfAdmin, otherAdmin]);

    await expectAppError(service.update(admin, admin.id, { active: false }), 'CONFLICT');
  });

  it('impide desactivar al último administrador activo', async () => {
    const { service } = buildService([otherAdmin]);

    await expectAppError(service.update(admin, otherAdmin.id, { active: false }), 'CONFLICT');
  });

  it('permite desactivar a un vigilador y audita el cambio', async () => {
    const { service, staff, audit } = buildService([otherAdmin]);
    const created = await service.create(admin, NEW_GUARD);

    const updated = await service.update(admin, created.id, { active: false });

    expect(updated.active).toBe(false);
    expect(staff.records.get(created.id)?.active).toBe(false);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'staff.updated',
      entityId: created.id,
    });
  });

  it('revoca las sesiones activas al desactivar un usuario', async () => {
    const { service, sessions } = buildService([otherAdmin]);
    const created = await service.create(admin, NEW_GUARD);

    await sessions.create({
      tokenHash: `sha256:${created.id}`,
      staffId: created.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.update(admin, created.id, { active: false });

    expect(sessions.records.size).toBe(0);
  });

  it('permite degradar un administrador si queda otro activo', async () => {
    const secondAdmin: StaffUserRecord = {
      ...otherAdmin,
      id: 'staff-2',
      username: 'admin.tres',
    };
    const { service } = buildService([otherAdmin, secondAdmin]);

    const updated = await service.update(admin, otherAdmin.id, { role: 'guard' });

    expect(updated.role).toBe('guard');
  });

  it('devuelve NOT_FOUND si el usuario no existe', async () => {
    const { service } = buildService([otherAdmin]);

    await expectAppError(service.update(admin, 'inexistente', { active: false }), 'NOT_FOUND');
  });

  it('no permite modificar usuarios a un vigilador', async () => {
    const { service } = buildService([otherAdmin]);

    await expectAppError(service.update(guard, otherAdmin.id, { active: false }), 'FORBIDDEN');
  });
});

describe('staffService.list', () => {
  it('devuelve usuarios sin hashes de contraseña', async () => {
    const { service } = buildService();
    await service.create(admin, NEW_GUARD);

    const result = await service.list(admin, { page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(JSON.stringify(result.items)).not.toContain('hash:');
    expect(JSON.stringify(result.items)).not.toContain('passwordHash');
  });
});
