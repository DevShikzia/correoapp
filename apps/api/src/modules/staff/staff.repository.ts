import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import type { Paginated } from '../../shared/pagination.js';
import type { StaffRole } from './staff.roles.js';
import { StaffUserModel, type StaffUserAttrs, type StaffUserDocument } from './staff-user.model.js';

export interface StaffUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStaffRecordInput {
  username: string;
  passwordHash: string;
  role: StaffRole;
}

export interface UpdateStaffRecordInput {
  role?: StaffRole;
  active?: boolean;
}

export interface StaffRepository {
  create(input: CreateStaffRecordInput): Promise<StaffUserRecord>;
  findById(id: string): Promise<StaffUserRecord | null>;
  findByUsername(username: string): Promise<StaffUserRecord | null>;
  list(page: number, limit: number): Promise<Paginated<StaffUserRecord>>;
  update(id: string, changes: UpdateStaffRecordInput): Promise<StaffUserRecord | null>;
  touchLastLogin(id: string): Promise<void>;
  countActiveAdmins(excludingId?: string): Promise<number>;
}

function toRecord(doc: StaffUserDocument): StaffUserRecord {
  return {
    id: doc._id.toString(),
    username: doc.username,
    passwordHash: doc.passwordHash,
    role: doc.role,
    active: doc.active,
    lastLoginAt: doc.lastLoginAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const staffRepository: StaffRepository = {
  async create(input: CreateStaffRecordInput): Promise<StaffUserRecord> {
    const doc = await StaffUserModel.create(input);
    return toRecord(doc);
  },

  async findById(id: string): Promise<StaffUserRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await StaffUserModel.findById(id).select('+passwordHash');
    return doc === null ? null : toRecord(doc);
  },

  async findByUsername(username: string): Promise<StaffUserRecord | null> {
    const doc = await StaffUserModel.findOne({ username: username.toLowerCase() }).select(
      '+passwordHash',
    );
    return doc === null ? null : toRecord(doc);
  },

  async list(page: number, limit: number): Promise<Paginated<StaffUserRecord>> {
    const [documents, total] = await Promise.all([
      StaffUserModel.find()
        .sort({ username: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      StaffUserModel.countDocuments(),
    ]);

    return { items: documents.map(toRecord), page, limit, total };
  },

  async update(id: string, changes: UpdateStaffRecordInput): Promise<StaffUserRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await StaffUserModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc === null ? null : toRecord(doc);
  },

  async touchLastLogin(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }
    await StaffUserModel.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
  },

  async countActiveAdmins(excludingId?: string): Promise<number> {
    const filter: QueryFilter<StaffUserAttrs> = { role: 'admin', active: true };

    if (excludingId !== undefined && isValidObjectId(excludingId)) {
      filter['_id'] = { $ne: new Types.ObjectId(excludingId) };
    }

    return StaffUserModel.countDocuments(filter);
  },
};
