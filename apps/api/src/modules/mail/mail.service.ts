import type { Actor } from '../../shared/actor.js';
import { AppError } from '../../shared/errors.js';
import type { Paginated, Pagination } from '../../shared/pagination.js';
import type { AuditRepository } from '../audit/audit.repository.js';
import type { LotRecord, LotRepository } from '../lots/lots.repository.js';
import type { MailNotifier } from '../notifications/notification.service.js';
import type { MailItemRecord, MailRepository } from './mail.repository.js';
import type { CreateMailInput } from './mail.validator.js';
import type { MailStatus } from './mail-item.model.js';

const UNKNOWN_LOT_MESSAGE = 'El lote no existe o está inactivo.';
const FUTURE_RECEIVED_AT_MESSAGE = 'La fecha de recepción no puede ser futura.';
const ALREADY_DELIVERED_MESSAGE = 'La correspondencia ya fue entregada.';

export interface MailItemDto {
  id: string;
  lotId: string;
  lotNumber: string;
  description: string | null;
  receivedAt: Date;
  receivedBy: string;
  status: MailStatus;
  deliveredAt: Date | null;
  deliveredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailServiceDeps {
  mail: MailRepository;
  lots: LotRepository;
  audit: AuditRepository;
  notifier: MailNotifier;
  now: () => Date;
}

export function toMailItemDto(record: MailItemRecord): MailItemDto {
  return {
    id: record.id,
    lotId: record.lotId,
    lotNumber: record.lotNumber,
    description: record.description,
    receivedAt: record.receivedAt,
    receivedBy: record.receivedBy,
    status: record.status,
    deliveredAt: record.deliveredAt,
    deliveredBy: record.deliveredBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeDescription(description: string | undefined): string | null {
  if (description === undefined || description.length === 0) {
    return null;
  }

  return description;
}

export function createMailService(deps: MailServiceDeps) {
  async function requireActiveLot(lotNumber: string): Promise<LotRecord> {
    const lot = await deps.lots.findByLotNumber(lotNumber);

    if (lot === null || !lot.active) {
      throw new AppError(404, 'NOT_FOUND', UNKNOWN_LOT_MESSAGE);
    }

    return lot;
  }

  async function requireMail(id: string): Promise<MailItemRecord> {
    const item = await deps.mail.findById(id);

    if (item === null) {
      throw new AppError(404, 'NOT_FOUND', 'La correspondencia no existe.');
    }

    return item;
  }

  return {
    async register(actor: Actor, input: CreateMailInput, requestId?: string): Promise<MailItemDto> {
      const lot = await requireActiveLot(input.lotNumber);
      const now = deps.now();
      const receivedAt = input.receivedAt ?? now;

      if (receivedAt.getTime() > now.getTime()) {
        throw new AppError(400, 'VALIDATION_ERROR', FUTURE_RECEIVED_AT_MESSAGE);
      }

      const created = await deps.mail.create({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        description: normalizeDescription(input.description),
        receivedAt,
        receivedBy: actor.id,
      });

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'mail.created',
        entityType: 'mailItem',
        entityId: created.id,
        lotId: created.lotId,
        requestId,
      });

      try {
        await deps.notifier.notifyMail({
          mailItemId: created.id,
          lotId: created.lotId,
          lotNumber: created.lotNumber,
          contacts: lot.contacts,
        });
      } catch {
        // La correspondencia ya está guardada: un fallo de notificación no la revierte.
      }

      return toMailItemDto(created);
    },

    async listPending(_actor: Actor, query: Pagination): Promise<Paginated<MailItemDto>> {
      const result = await deps.mail.listPending(query.page, query.limit);
      return { ...result, items: result.items.map(toMailItemDto) };
    },

    async getById(_actor: Actor, id: string): Promise<MailItemDto> {
      return toMailItemDto(await requireMail(id));
    },

    async deliver(actor: Actor, id: string, requestId?: string): Promise<MailItemDto> {
      const current = await requireMail(id);

      if (current.status === 'delivered') {
        throw new AppError(409, 'CONFLICT', ALREADY_DELIVERED_MESSAGE);
      }

      const delivered = await deps.mail.markDelivered(id, actor.id, deps.now());

      if (delivered === null) {
        throw new AppError(409, 'CONFLICT', ALREADY_DELIVERED_MESSAGE);
      }

      await deps.audit.record({
        actorType: 'staff',
        actorId: actor.id,
        action: 'mail.delivered',
        entityType: 'mailItem',
        entityId: delivered.id,
        lotId: delivered.lotId,
        requestId,
      });

      return toMailItemDto(delivered);
    },
  };
}

export type MailService = ReturnType<typeof createMailService>;
