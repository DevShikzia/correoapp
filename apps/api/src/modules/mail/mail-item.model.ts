import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export const MAIL_STATUSES = ['pending', 'delivered'] as const;

export type MailStatus = (typeof MAIL_STATUSES)[number];

const DESCRIPTION_MAX_LENGTH = 200;

export interface MailItemAttrs {
  lotId: Types.ObjectId;
  description: string | null;
  receivedAt: Date;
  receivedBy: Types.ObjectId;
  status: MailStatus;
  deliveredAt: Date | null;
  deliveredBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const mailItemSchema = new Schema<MailItemAttrs>(
  {
    lotId: { type: Schema.Types.ObjectId, ref: 'Lot', required: true },
    description: { type: String, trim: true, maxlength: DESCRIPTION_MAX_LENGTH, default: null },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true },
    status: { type: String, required: true, enum: MAIL_STATUSES, default: 'pending' },
    deliveredAt: { type: Date, default: null },
    deliveredBy: { type: Schema.Types.ObjectId, ref: 'StaffUser', default: null },
  },
  { timestamps: true },
);

mailItemSchema.index({ lotId: 1, receivedAt: -1 });
mailItemSchema.index({ status: 1, receivedAt: -1 });

export type MailItemDocument = HydratedDocument<MailItemAttrs>;

export const MailItemModel = model<MailItemAttrs>('MailItem', mailItemSchema);

export const MAIL_LIMITS = { descriptionMaxLength: DESCRIPTION_MAX_LENGTH } as const;
