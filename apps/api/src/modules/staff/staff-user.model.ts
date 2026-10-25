import { model, Schema, type HydratedDocument } from 'mongoose';
import { USERNAME_PATTERN } from './staff.constants.js';
import { STAFF_ROLES, type StaffRole } from './staff.roles.js';

export interface StaffUserAttrs {
  username: string;
  passwordHash: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const staffUserSchema = new Schema<StaffUserAttrs>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: USERNAME_PATTERN,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: STAFF_ROLES },
    active: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

staffUserSchema.index({ username: 1 }, { unique: true });

export type StaffUserDocument = HydratedDocument<StaffUserAttrs>;

export const StaffUserModel = model<StaffUserAttrs>('StaffUser', staffUserSchema);
