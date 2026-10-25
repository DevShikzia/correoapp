import type {
  CreateStaffSessionInput,
  StaffSessionRecord,
  StaffSessionsRepository,
} from '../src/modules/auth/auth-sessions.repository.js';
import type { AuditEntryInput, AuditRepository } from '../src/modules/audit/audit.repository.js';
import type {
  CreateLotRecordInput,
  LotCredentials,
  LotRecord,
  LotRepository,
  UpdateLotRecordInput,
} from '../src/modules/lots/lots.repository.js';
import type { LotListQuery } from '../src/modules/lots/lots.validator.js';
import type {
  CreateMailItemInput,
  MailItemRecord,
  MailRepository,
} from '../src/modules/mail/mail.repository.js';
import type {
  CreatePublicSessionInput,
  PublicSessionRecord,
  PublicSessionsRepository,
} from '../src/modules/public/public-sessions.repository.js';
import type {
  CreateStaffRecordInput,
  StaffRepository,
  StaffUserRecord,
  UpdateStaffRecordInput,
} from '../src/modules/staff/staff.repository.js';
import type { Paginated } from '../src/shared/pagination.js';

const DUPLICATE_KEY_CODE = 11000;

export interface AuditRepositoryFake extends AuditRepository {
  entries: AuditEntryInput[];
}

export function createAuditRepositoryFake(): AuditRepositoryFake {
  const entries: AuditEntryInput[] = [];

  return {
    entries,
    async record(entry: AuditEntryInput): Promise<void> {
      entries.push(entry);
    },
  };
}

export interface LotRepositoryFake extends LotRepository {
  records: Map<string, LotRecord>;
  failNextCreateWithDuplicateKey(): void;
}

export function createLotRepositoryFake(seed: LotRecord[] = []): LotRepositoryFake {
  const records = new Map(seed.map((record) => [record.id, record]));
  let duplicateNext = false;
  let sequence = records.size;

  return {
    records,

    failNextCreateWithDuplicateKey(): void {
      duplicateNext = true;
    },

    async create(input: CreateLotRecordInput): Promise<LotRecord> {
      if (duplicateNext) {
        duplicateNext = false;
        throw Object.assign(new Error('duplicate key'), { code: DUPLICATE_KEY_CODE });
      }

      sequence += 1;
      const now = new Date();
      const record: LotRecord = {
        id: `lot-${sequence}`,
        lotNumber: input.lotNumber,
        ownerNames: [...input.ownerNames],
        contacts: input.contacts.map((contact) => ({ ...contact })),
        pinHash: input.pinHash,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      records.set(record.id, record);
      return record;
    },

    async findById(id: string): Promise<LotRecord | null> {
      return records.get(id) ?? null;
    },

    async findByLotNumber(lotNumber: string): Promise<LotRecord | null> {
      return [...records.values()].find((record) => record.lotNumber === lotNumber) ?? null;
    },

    async findCredentialsByLotNumber(lotNumber: string): Promise<LotCredentials | null> {
      const record = [...records.values()].find((item) => item.lotNumber === lotNumber);

      if (record === undefined) {
        return null;
      }

      return {
        id: record.id,
        lotNumber: record.lotNumber,
        pinHash: record.pinHash,
        active: record.active,
      };
    },

    async list({ page, limit, search }: LotListQuery): Promise<Paginated<LotRecord>> {
      const normalized = search?.toLowerCase() ?? '';
      const matches = [...records.values()]
        .filter(
          (record) =>
            normalized.length === 0 ||
            record.lotNumber.includes(normalized) ||
            record.ownerNames.some((name) => name.toLowerCase().includes(normalized)),
        )
        .sort((first, second) => first.lotNumber.localeCompare(second.lotNumber));

      return {
        items: matches.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: matches.length,
      };
    },

    async update(id: string, changes: UpdateLotRecordInput): Promise<LotRecord | null> {
      const record = records.get(id);
      if (record === undefined) {
        return null;
      }

      const updated: LotRecord = { ...record, ...changes, updatedAt: new Date() };
      records.set(id, updated);
      return updated;
    },

    async setPinHash(id: string, pinHash: string): Promise<LotRecord | null> {
      const record = records.get(id);
      if (record === undefined) {
        return null;
      }

      const updated: LotRecord = { ...record, pinHash, updatedAt: new Date() };
      records.set(id, updated);
      return updated;
    },
  };
}

export interface StaffRepositoryFake extends StaffRepository {
  records: Map<string, StaffUserRecord>;
}

export function createStaffRepositoryFake(seed: StaffUserRecord[] = []): StaffRepositoryFake {
  const records = new Map(seed.map((record) => [record.id, record]));
  let sequence = records.size;

  return {
    records,

    async create(input: CreateStaffRecordInput): Promise<StaffUserRecord> {
      sequence += 1;
      const now = new Date();
      const record: StaffUserRecord = {
        id: `staff-${sequence}`,
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role,
        active: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };

      records.set(record.id, record);
      return record;
    },

    async findById(id: string): Promise<StaffUserRecord | null> {
      return records.get(id) ?? null;
    },

    async findByUsername(username: string): Promise<StaffUserRecord | null> {
      return (
        [...records.values()].find((record) => record.username === username.toLowerCase()) ?? null
      );
    },

    async list(page: number, limit: number): Promise<Paginated<StaffUserRecord>> {
      const matches = [...records.values()].sort((first, second) =>
        first.username.localeCompare(second.username),
      );

      return {
        items: matches.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: matches.length,
      };
    },

    async update(id: string, changes: UpdateStaffRecordInput): Promise<StaffUserRecord | null> {
      const record = records.get(id);
      if (record === undefined) {
        return null;
      }

      const updated: StaffUserRecord = { ...record, ...changes, updatedAt: new Date() };
      records.set(id, updated);
      return updated;
    },

    async touchLastLogin(id: string): Promise<void> {
      const record = records.get(id);
      if (record === undefined) {
        return;
      }

      records.set(id, { ...record, lastLoginAt: new Date(), updatedAt: new Date() });
    },

    async countActiveAdmins(excludingId?: string): Promise<number> {
      return [...records.values()].filter(
        (record) =>
          record.role === 'admin' &&
          record.active &&
          (excludingId === undefined || record.id !== excludingId),
      ).length;
    },
  };
}

export interface StaffSessionsRepositoryFake extends StaffSessionsRepository {
  records: Map<string, StaffSessionRecord>;
}

export function createStaffSessionsRepositoryFake(
  seed: StaffSessionRecord[] = [],
): StaffSessionsRepositoryFake {
  const records = new Map(seed.map((record) => [record.id, record]));
  let sequence = records.size;

  return {
    records,

    async create(input: CreateStaffSessionInput): Promise<StaffSessionRecord> {
      sequence += 1;
      const record: StaffSessionRecord = {
        id: `session-${sequence}`,
        tokenHash: input.tokenHash,
        staffId: input.staffId,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };

      records.set(record.id, record);
      return record;
    },

    async findActiveByTokenHash(tokenHash: string, now: Date): Promise<StaffSessionRecord | null> {
      return (
        [...records.values()].find(
          (record) => record.tokenHash === tokenHash && record.expiresAt > now,
        ) ?? null
      );
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      for (const [id, record] of records) {
        if (record.tokenHash === tokenHash) {
          records.delete(id);
        }
      }
    },

    async revokeAllForStaff(staffId: string): Promise<void> {
      for (const [id, record] of records) {
        if (record.staffId === staffId) {
          records.delete(id);
        }
      }
    },
  };
}

export interface MailRepositoryFake extends MailRepository {
  records: Map<string, MailItemRecord>;
  failNextDeliveryWithConflict(): void;
}

export function createMailRepositoryFake(seed: MailItemRecord[] = []): MailRepositoryFake {
  const records = new Map(seed.map((record) => [record.id, record]));
  let sequence = records.size;
  let failNextDelivery = false;

  return {
    records,

    failNextDeliveryWithConflict(): void {
      failNextDelivery = true;
    },

    async create(input: CreateMailItemInput): Promise<MailItemRecord> {
      sequence += 1;
      const now = new Date();
      const record: MailItemRecord = {
        id: `mail-${sequence}`,
        lotId: input.lotId,
        lotNumber: input.lotNumber,
        description: input.description,
        receivedAt: input.receivedAt,
        receivedBy: input.receivedBy,
        status: 'pending',
        deliveredAt: null,
        deliveredBy: null,
        createdAt: now,
        updatedAt: now,
      };

      records.set(record.id, record);
      return record;
    },

    async findById(id: string): Promise<MailItemRecord | null> {
      return records.get(id) ?? null;
    },

    async listPending(page: number, limit: number): Promise<Paginated<MailItemRecord>> {
      const pending = [...records.values()]
        .filter((record) => record.status === 'pending')
        .sort((first, second) => first.receivedAt.getTime() - second.receivedAt.getTime());

      return {
        items: pending.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: pending.length,
      };
    },

    async listByLot(
      lotId: string,
      page: number,
      limit: number,
    ): Promise<Paginated<MailItemRecord>> {
      const items = [...records.values()]
        .filter((record) => record.lotId === lotId)
        .sort((first, second) => second.receivedAt.getTime() - first.receivedAt.getTime());

      return {
        items: items.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: items.length,
      };
    },

    async markDelivered(
      id: string,
      deliveredBy: string,
      deliveredAt: Date,
    ): Promise<MailItemRecord | null> {
      if (failNextDelivery) {
        failNextDelivery = false;
        return null;
      }

      const record = records.get(id);
      if (record === undefined || record.status !== 'pending') {
        return null;
      }

      const updated: MailItemRecord = {
        ...record,
        status: 'delivered',
        deliveredAt,
        deliveredBy,
        updatedAt: new Date(),
      };

      records.set(id, updated);
      return updated;
    },
  };
}

export interface PublicSessionsRepositoryFake extends PublicSessionsRepository {
  records: Map<string, PublicSessionRecord>;
}

export function createPublicSessionsRepositoryFake(
  seed: PublicSessionRecord[] = [],
): PublicSessionsRepositoryFake {
  const records = new Map(seed.map((record) => [record.id, record]));
  let sequence = records.size;

  return {
    records,

    async create(input: CreatePublicSessionInput): Promise<PublicSessionRecord> {
      sequence += 1;
      const record: PublicSessionRecord = {
        id: `owner-session-${sequence}`,
        tokenHash: input.tokenHash,
        lotId: input.lotId,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };

      records.set(record.id, record);
      return record;
    },

    async findActiveByTokenHash(tokenHash: string, now: Date): Promise<PublicSessionRecord | null> {
      return (
        [...records.values()].find(
          (record) => record.tokenHash === tokenHash && record.expiresAt > now,
        ) ?? null
      );
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      for (const [id, record] of records) {
        if (record.tokenHash === tokenHash) {
          records.delete(id);
        }
      }
    },

    async revokeAllForLot(lotId: string): Promise<void> {
      for (const [id, record] of records) {
        if (record.lotId === lotId) {
          records.delete(id);
        }
      }
    },
  };
}
