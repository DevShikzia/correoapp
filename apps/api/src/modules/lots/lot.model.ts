import { model, Schema, type HydratedDocument } from 'mongoose';
import {
  CONTACT_NAME_MAX_LENGTH,
  LOT_NUMBER_PATTERN,
  MAX_OWNER_NAMES,
  PHONE_PATTERN,
} from './lot.constants.js';

export interface LotContact {
  name: string;
  phone: string;
}

export interface LotAttrs {
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  pinHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<LotContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: CONTACT_NAME_MAX_LENGTH },
    phone: { type: String, required: true, trim: true, match: PHONE_PATTERN },
  },
  { _id: false },
);

const lotSchema = new Schema<LotAttrs>(
  {
    lotNumber: { type: String, required: true, trim: true, match: LOT_NUMBER_PATTERN },
    ownerNames: {
      type: [String],
      required: true,
      validate: {
        validator: (names: string[]) => names.length > 0 && names.length <= MAX_OWNER_NAMES,
        message: `El lote debe tener entre 1 y ${MAX_OWNER_NAMES} propietarios.`,
      },
    },
    contacts: { type: [contactSchema], default: [] },
    pinHash: { type: String, required: true, select: false },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

lotSchema.index({ lotNumber: 1 }, { unique: true });
lotSchema.index({ active: 1, lotNumber: 1 });

export type LotDocument = HydratedDocument<LotAttrs>;

export const LotModel = model<LotAttrs>('Lot', lotSchema);
