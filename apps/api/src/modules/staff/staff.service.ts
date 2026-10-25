import type { Actor } from '../../shared/actor.js';
import { assertAdmin } from '../../shared/authorization.js';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/mongo-errors.js';
import type { Paginated } from '../../shared/pagination.js';
import { hashSecret } from '../../shared/password.js';
import type { AuditRepository } from '../audit/audit.repository.js';
import { auditRepository } from '../audit/audit.repository.js';
import type { StaffRole } from './staff.roles.js';
import type { StaffUserRecord, StaffRepository } from './staff.repository.js';
import { staffRepository } from './staff.repository.js';
import type { CreateStaffInput, StaffListQuery, UpdateStaffInput } from './staff.validator.js';

const DUPLICATE_USERNAME_MESSAGE = 'Ya existe un usuario con ese nombre.';

export interface StaffDto {
  id: string;
  username: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffServiceDeps {
  staff: StaffRepository;
  audit: AuditRepository;
  hashPassword: (password: string) => Promise<string>;
}

export function toStaffDto(record: StaffUserRecord): StaffDto {
  return {
    id: record.id,
    username: record.username,
    role: record.role,
    active: record.active,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createStaffService(deps: StaffServiceDeps) {
  async function requireStaff(id: string): Promise<StaffUserRecord> {
    const record = await deps.staff.findById(id);
    if (record === null) {
      throw new AppError(404, 'NOT_FOUND', 'El usuario no existe.');
    }
    return record;
  }

  return {
    async create(actor: Actor, input: CreateStaffInput, requestId?: string): Promise<StaffDto> {
      assertAdmin(actor);

      if ((await deps.staff.findByUsername(input.username)) !== null) {
        throw new AppError(409, 'CONFLICT', DUPLICATE_USERNAME_MESSAGE);
      }

      const passwordHash = await deps.hashPassword(input.password);

      let created: StaffUserRecord;
      try {
        created = await deps.staff.create({
          username: input.username,
          passwordHash,
          role: input.role,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new AppError(409, 'CONFLICT', DUPLICATE_USERNAME_MESSAGE);
        }
        throw error;
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'staff.created',
        entityType: 'staffUser',
        entityId: created.id,
        requestId,
      });

      return toStaffDto(created);
    },

    async list(actor: Actor, query: StaffListQuery): Promise<Paginated<StaffDto>> {
      assertAdmin(actor);
      const result = await deps.staff.list(query.page, query.limit);
      return { ...result, items: result.items.map(toStaffDto) };
    },

    async update(
      actor: Actor,
      id: string,
      changes: UpdateStaffInput,
      requestId?: string,
    ): Promise<StaffDto> {
      assertAdmin(actor);
      const current = await requireStaff(id);

      if (current.id === actor.id) {
        throw new AppError(409, 'CONFLICT', 'No podés modificar tu propio usuario.');
      }

      const losesAdminAccess =
        current.role === 'admin' &&
        ((changes.role !== undefined && changes.role !== 'admin') || changes.active === false);

      if (losesAdminAccess && (await deps.staff.countActiveAdmins(current.id)) === 0) {
        throw new AppError(409, 'CONFLICT', 'Tiene que quedar al menos un administrador activo.');
      }

      const updated = await deps.staff.update(id, changes);
      if (updated === null) {
        throw new AppError(404, 'NOT_FOUND', 'El usuario no existe.');
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'staff.updated',
        entityType: 'staffUser',
        entityId: updated.id,
        requestId,
      });

      return toStaffDto(updated);
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;

export const staffService: StaffService = createStaffService({
  staff: staffRepository,
  audit: auditRepository,
  hashPassword: hashSecret,
});
