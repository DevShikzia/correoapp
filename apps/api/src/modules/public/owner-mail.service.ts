import type { Paginated, Pagination } from '../../shared/pagination.js';
import type { MailStatus } from '../mail/mail-item.model.js';
import type { MailItemRecord, MailRepository } from '../mail/mail.repository.js';

export interface OwnerMailItemDto {
  id: string;
  description: string | null;
  receivedAt: Date;
  status: MailStatus;
  deliveredAt: Date | null;
}

export interface OwnerMailServiceDeps {
  mail: Pick<MailRepository, 'listByLot'>;
}

export interface OwnerMailService {
  list(lotId: string, query: Pagination): Promise<Paginated<OwnerMailItemDto>>;
}

export function toOwnerMailItemDto(record: MailItemRecord): OwnerMailItemDto {
  return {
    id: record.id,
    description: record.description,
    receivedAt: record.receivedAt,
    status: record.status,
    deliveredAt: record.deliveredAt,
  };
}

export function createOwnerMailService(deps: OwnerMailServiceDeps): OwnerMailService {
  return {
    async list(lotId: string, query: Pagination): Promise<Paginated<OwnerMailItemDto>> {
      const result = await deps.mail.listByLot(lotId, query.page, query.limit);
      return { ...result, items: result.items.map(toOwnerMailItemDto) };
    },
  };
}
