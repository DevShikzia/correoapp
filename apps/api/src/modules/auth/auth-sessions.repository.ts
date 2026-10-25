import { isValidObjectId, Types } from 'mongoose';
import { StaffSessionModel, type StaffSessionDocument } from './auth-session.model.js';

export interface StaffSessionRecord {
  id: string;
  tokenHash: string;
  staffId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateStaffSessionInput {
  tokenHash: string;
  staffId: string;
  expiresAt: Date;
}

export interface StaffSessionsRepository {
  create(input: CreateStaffSessionInput): Promise<StaffSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<StaffSessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  revokeAllForStaff(staffId: string): Promise<void>;
}

function toRecord(doc: StaffSessionDocument): StaffSessionRecord {
  return {
    id: doc._id.toString(),
    tokenHash: doc.tokenHash,
    staffId: doc.staffId.toString(),
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  };
}

export const staffSessionsRepository: StaffSessionsRepository = {
  async create(input: CreateStaffSessionInput): Promise<StaffSessionRecord> {
    if (!isValidObjectId(input.staffId)) {
      throw new Error('staffId inválido');
    }

    const doc = await StaffSessionModel.create({
      tokenHash: input.tokenHash,
      staffId: new Types.ObjectId(input.staffId),
      expiresAt: input.expiresAt,
    });

    return toRecord(doc);
  },

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<StaffSessionRecord | null> {
    const doc = await StaffSessionModel.findOne({ tokenHash, expiresAt: { $gt: now } });
    return doc === null ? null : toRecord(doc);
  },

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await StaffSessionModel.deleteOne({ tokenHash });
  },

  async revokeAllForStaff(staffId: string): Promise<void> {
    if (!isValidObjectId(staffId)) {
      return;
    }
    await StaffSessionModel.deleteMany({ staffId: new Types.ObjectId(staffId) });
  },
};
