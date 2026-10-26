import { isValidObjectId, Types } from 'mongoose';
import type { Paginated } from '../../shared/pagination.js';
import { MailItemModel, type MailItemDocument, type MailStatus } from './mail-item.model.js';

export interface MailItemRecord {
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

export interface CreateMailItemInput {
  lotId: string;
  lotNumber: string;
  description: string | null;
  receivedAt: Date;
  receivedBy: string;
}

export interface MailRepository {
  create(input: CreateMailItemInput): Promise<MailItemRecord>;
  findById(id: string): Promise<MailItemRecord | null>;
  listPending(page: number, limit: number): Promise<Paginated<MailItemRecord>>;
  listByLot(lotId: string, page: number, limit: number): Promise<Paginated<MailItemRecord>>;
  markDelivered(id: string, deliveredBy: string, deliveredAt: Date): Promise<MailItemRecord | null>;
}

function toRecord(doc: MailItemDocument): MailItemRecord {
  return {
    id: doc._id.toString(),
    lotId: doc.lotId.toString(),
    lotNumber: doc.lotNumber,
    description: doc.description,
    receivedAt: doc.receivedAt,
    receivedBy: doc.receivedBy.toString(),
    status: doc.status,
    deliveredAt: doc.deliveredAt,
    deliveredBy: doc.deliveredBy?.toString() ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const mailRepository: MailRepository = {
  async create(input: CreateMailItemInput): Promise<MailItemRecord> {
    if (!isValidObjectId(input.lotId) || !isValidObjectId(input.receivedBy)) {
      throw new Error('Referencias inválidas al registrar la correspondencia');
    }

    const doc = await MailItemModel.create({
      lotId: new Types.ObjectId(input.lotId),
      lotNumber: input.lotNumber,
      description: input.description,
      receivedAt: input.receivedAt,
      receivedBy: new Types.ObjectId(input.receivedBy),
    });

    return toRecord(doc);
  },

  async findById(id: string): Promise<MailItemRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const doc = await MailItemModel.findById(id);
    return doc === null ? null : toRecord(doc);
  },

  async listPending(page: number, limit: number): Promise<Paginated<MailItemRecord>> {
    const filter = { status: 'pending' as const };

    const [documents, total] = await Promise.all([
      MailItemModel.find(filter)
        .sort({ receivedAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MailItemModel.countDocuments(filter),
    ]);

    return { items: documents.map(toRecord), page, limit, total };
  },

  async listByLot(lotId: string, page: number, limit: number): Promise<Paginated<MailItemRecord>> {
    if (!isValidObjectId(lotId)) {
      return { items: [], page, limit, total: 0 };
    }

    const filter = { lotId: new Types.ObjectId(lotId) };

    const [documents, total] = await Promise.all([
      MailItemModel.find(filter)
        .sort({ receivedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MailItemModel.countDocuments(filter),
    ]);

    return { items: documents.map(toRecord), page, limit, total };
  },

  async markDelivered(
    id: string,
    deliveredBy: string,
    deliveredAt: Date,
  ): Promise<MailItemRecord | null> {
    if (!isValidObjectId(id) || !isValidObjectId(deliveredBy)) {
      return null;
    }

    // Solo actualiza si sigue pendiente: la transición es atómica y evita
    // que dos entregas simultáneas dejen datos contradictorios.
    const doc = await MailItemModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: {
          status: 'delivered',
          deliveredAt,
          deliveredBy: new Types.ObjectId(deliveredBy),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );

    return doc === null ? null : toRecord(doc);
  },
};
