import type { Actor } from '../../shared/actor.js';
import { assertAdmin } from '../../shared/authorization.js';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/mongo-errors.js';
import type { Paginated } from '../../shared/pagination.js';
import { hashSecret } from '../../shared/password.js';
import type { AuditRepository } from '../audit/audit.repository.js';
import { auditRepository } from '../audit/audit.repository.js';
import type { LotContact } from './lot.model.js';
import type { CreateLotInput, LotListQuery, UpdateLotInput } from './lots.validator.js';
import type { LotRecord, LotRepository } from './lots.repository.js';
import { lotRepository } from './lots.repository.js';

const DUPLICATE_LOT_MESSAGE = 'Ya existe un lote con ese número.';

export interface LotDto {
  id: string;
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LotsServiceDeps {
  lots: LotRepository;
  audit: AuditRepository;
  hashPin: (pin: string) => Promise<string>;
}

export function toLotDto(record: LotRecord): LotDto {
  return {
    id: record.id,
    lotNumber: record.lotNumber,
    ownerNames: record.ownerNames,
    contacts: record.contacts,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createLotsService(deps: LotsServiceDeps) {
  async function requireLot(id: string): Promise<LotRecord> {
    const lot = await deps.lots.findById(id);
    if (lot === null) {
      throw new AppError(404, 'NOT_FOUND', 'El lote no existe.');
    }
    return lot;
  }

  return {
    async create(actor: Actor, input: CreateLotInput, requestId?: string): Promise<LotDto> {
      assertAdmin(actor);

      if ((await deps.lots.findByLotNumber(input.lotNumber)) !== null) {
        throw new AppError(409, 'CONFLICT', DUPLICATE_LOT_MESSAGE);
      }

      const pinHash = await deps.hashPin(input.pin);

      let created: LotRecord;
      try {
        created = await deps.lots.create({
          lotNumber: input.lotNumber,
          ownerNames: input.ownerNames,
          contacts: input.contacts,
          pinHash,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new AppError(409, 'CONFLICT', DUPLICATE_LOT_MESSAGE);
        }
        throw error;
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'lot.created',
        entityType: 'lot',
        entityId: created.id,
        lotId: created.id,
        requestId,
      });

      return toLotDto(created);
    },

    async list(actor: Actor, query: LotListQuery): Promise<Paginated<LotDto>> {
      assertAdmin(actor);
      const result = await deps.lots.list(query);
      return { ...result, items: result.items.map(toLotDto) };
    },

    async getById(actor: Actor, id: string): Promise<LotDto> {
      assertAdmin(actor);
      return toLotDto(await requireLot(id));
    },

    async update(
      actor: Actor,
      id: string,
      changes: UpdateLotInput,
      requestId?: string,
    ): Promise<LotDto> {
      assertAdmin(actor);
      await requireLot(id);

      const updated = await deps.lots.update(id, changes);
      if (updated === null) {
        throw new AppError(404, 'NOT_FOUND', 'El lote no existe.');
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'lot.updated',
        entityType: 'lot',
        entityId: updated.id,
        lotId: updated.id,
        requestId,
      });

      return toLotDto(updated);
    },

    async resetPin(actor: Actor, id: string, pin: string, requestId?: string): Promise<void> {
      assertAdmin(actor);
      await requireLot(id);

      const pinHash = await deps.hashPin(pin);
      const updated = await deps.lots.setPinHash(id, pinHash);
      if (updated === null) {
        throw new AppError(404, 'NOT_FOUND', 'El lote no existe.');
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'lot.pin_reset',
        entityType: 'lot',
        entityId: updated.id,
        lotId: updated.id,
        requestId,
      });
    },
  };
}

export type LotsService = ReturnType<typeof createLotsService>;

export const lotsService: LotsService = createLotsService({
  lots: lotRepository,
  audit: auditRepository,
  hashPin: hashSecret,
});
