import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface PublicSessionAttrs {
  tokenHash: string;
  lotId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const publicSessionSchema = new Schema<PublicSessionAttrs>(
  {
    tokenHash: { type: String, required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'Lot', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

publicSessionSchema.index({ tokenHash: 1 }, { unique: true });
publicSessionSchema.index({ lotId: 1 });
publicSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PublicSessionDocument = HydratedDocument<PublicSessionAttrs>;
export const PublicSessionModel = model<PublicSessionAttrs>('PublicSession', publicSessionSchema);
