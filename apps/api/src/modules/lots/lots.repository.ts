import { isValidObjectId, type QueryFilter } from 'mongoose';
import type { Paginated } from '../../shared/pagination.js';
import { LotModel, type LotAttrs, type LotContact, type LotDocument } from './lot.model.js';
import type { LotListQuery } from './lots.validator.js';

export interface LotRecord {
  id: string;
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  pinHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LotCredentials {
  id: string;
  lotNumber: string;
  pinHash: string;
  active: boolean;
}

export interface CreateLotRecordInput {
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  pinHash: string;
}

export interface UpdateLotRecordInput {
  ownerNames?: string[];
  contacts?: LotContact[];
  active?: boolean;
}

export interface LotRepository {
  create(input: CreateLotRecordInput): Promise<LotRecord>;
  findById(id: string): Promise<LotRecord | null>;
  findByLotNumber(lotNumber: string): Promise<LotRecord | null>;
  findCredentialsByLotNumber(lotNumber: string): Promise<LotCredentials | null>;
  list(query: LotListQuery): Promise<Paginated<LotRecord>>;
  update(id: string, changes: UpdateLotRecordInput): Promise<LotRecord | null>;
  setPinHash(id: string, pinHash: string): Promise<LotRecord | null>;
}

function toRecord(doc: LotDocument): LotRecord {
  return {
    id: doc._id.toString(),
    lotNumber: doc.lotNumber,
    ownerNames: [...doc.ownerNames],
    contacts: doc.contacts.map((contact) => ({ name: contact.name, phone: contact.phone })),
    pinHash: doc.pinHash,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const lotRepository: LotRepository = {
  async create(input: CreateLotRecordInput): Promise<LotRecord> {
    const doc = await LotModel.create(input);
    return toRecord(doc);
  },

  async findById(id: string): Promise<LotRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await LotModel.findById(id);
    return doc === null ? null : toRecord(doc);
  },

  async findByLotNumber(lotNumber: string): Promise<LotRecord | null> {
    const doc = await LotModel.findOne({ lotNumber });
    return doc === null ? null : toRecord(doc);
  },

  async findCredentialsByLotNumber(lotNumber: string): Promise<LotCredentials | null> {
    const doc = await LotModel.findOne({ lotNumber }).select('+pinHash');

    if (doc === null) {
      return null;
    }

    return {
      id: doc._id.toString(),
      lotNumber: doc.lotNumber,
      pinHash: doc.pinHash,
      active: doc.active,
    };
  },

  async list({ page, limit, search }: LotListQuery): Promise<Paginated<LotRecord>> {
    const filter: QueryFilter<LotAttrs> = {};

    if (search !== undefined && search.length > 0) {
      const pattern = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [{ lotNumber: pattern }, { ownerNames: pattern }];
    }

    const [documents, total] = await Promise.all([
      LotModel.find(filter)
        .sort({ lotNumber: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      LotModel.countDocuments(filter),
    ]);

    return { items: documents.map(toRecord), page, limit, total };
  },

  async update(id: string, changes: UpdateLotRecordInput): Promise<LotRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await LotModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc === null ? null : toRecord(doc);
  },

  async setPinHash(id: string, pinHash: string): Promise<LotRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await LotModel.findByIdAndUpdate(
      id,
      { $set: { pinHash } },
      { new: true, runValidators: true },
    );
    return doc === null ? null : toRecord(doc);
  },
};
