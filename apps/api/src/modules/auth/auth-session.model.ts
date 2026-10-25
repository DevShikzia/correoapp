import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface StaffSessionAttrs {
  tokenHash: string;
  staffId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const staffSessionSchema = new Schema<StaffSessionAttrs>(
  {
    tokenHash: { type: String, required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

staffSessionSchema.index({ tokenHash: 1 }, { unique: true });
staffSessionSchema.index({ staffId: 1 });
staffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type StaffSessionDocument = HydratedDocument<StaffSessionAttrs>;

export const StaffSessionModel = model<StaffSessionAttrs>('StaffSession', staffSessionSchema);
