import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { LOT_NUMBER_PATTERN, PHONE_PATTERN } from './notification.constants.js';

// Espejo del modelo de `apps/api`; el worker es un proceso desplegable aparte.
export const NOTIFICATION_STATUSES = ['pending', 'queued', 'sending', 'sent', 'failed'] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface NotificationJobAttrs {
  mailItemId: Types.ObjectId;
  lotId: Types.ObjectId;
  lotNumber: string;
  phone: string;
  status: NotificationStatus;
  attempts: number;
  providerMessageId: string | null;
  providerStatus: string | null;
  lastErrorCode: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationJobSchema = new Schema<NotificationJobAttrs>(
  {
    mailItemId: { type: Schema.Types.ObjectId, ref: 'MailItem', required: true },
    lotId: { type: Schema.Types.ObjectId, ref: 'Lot', required: true },
    lotNumber: { type: String, required: true, trim: true, match: LOT_NUMBER_PATTERN },
    phone: { type: String, required: true, trim: true, match: PHONE_PATTERN },
    status: { type: String, required: true, enum: NOTIFICATION_STATUSES, default: 'pending' },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    providerMessageId: { type: String, default: null },
    providerStatus: { type: String, default: null },
    lastErrorCode: { type: String, default: null, maxlength: 64 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationJobSchema.index({ mailItemId: 1, phone: 1 }, { unique: true });
notificationJobSchema.index({ status: 1, createdAt: 1 });
notificationJobSchema.index({ providerMessageId: 1 });

export type NotificationJobDocument = HydratedDocument<NotificationJobAttrs>;

export const NotificationJobModel = model<NotificationJobAttrs>(
  'NotificationJob',
  notificationJobSchema,
);
