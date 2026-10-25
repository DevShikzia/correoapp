import { isValidObjectId, Types } from 'mongoose';
import { PublicSessionModel, type PublicSessionDocument } from './public-session.model.js';

export interface PublicSessionRecord {
  id: string;
  tokenHash: string;
  lotId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreatePublicSessionInput {
  tokenHash: string;
  lotId: string;
  expiresAt: Date;
}

export interface PublicSessionsRepository {
  create(input: CreatePublicSessionInput): Promise<PublicSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<PublicSessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  revokeAllForLot(lotId: string): Promise<void>;
}

function toRecord(doc: PublicSessionDocument): PublicSessionRecord {
  return {
    id: doc._id.toString(),
    tokenHash: doc.tokenHash,
    lotId: doc.lotId.toString(),
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  };
}

export const publicSessionsRepository: PublicSessionsRepository = {
  async create(input: CreatePublicSessionInput): Promise<PublicSessionRecord> {
    if (!isValidObjectId(input.lotId)) {
      throw new Error('lotId inválido');
    }

    const doc = await PublicSessionModel.create({
      tokenHash: input.tokenHash,
      lotId: new Types.ObjectId(input.lotId),
      expiresAt: input.expiresAt,
    });

    return toRecord(doc);
  },

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<PublicSessionRecord | null> {
    const doc = await PublicSessionModel.findOne({ tokenHash, expiresAt: { $gt: now } });
    return doc === null ? null : toRecord(doc);
  },

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await PublicSessionModel.deleteOne({ tokenHash });
  },

  async revokeAllForLot(lotId: string): Promise<void> {
    if (!isValidObjectId(lotId)) {
      return;
    }
    await PublicSessionModel.deleteMany({ lotId: new Types.ObjectId(lotId) });
  },
};
