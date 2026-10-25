import { z } from 'zod';
import {
  CONTACT_NAME_MAX_LENGTH,
  LOT_NUMBER_PATTERN,
  MAX_CONTACTS,
  MAX_OWNER_NAMES,
  OWNER_NAME_MAX_LENGTH,
  PHONE_PATTERN,
  PIN_PATTERN,
} from './lot.constants.js';

export const lotContactSchema = z.object({
  name: z.string().trim().min(2).max(CONTACT_NAME_MAX_LENGTH),
  phone: z
    .string()
    .trim()
    .regex(PHONE_PATTERN, 'El teléfono debe incluir código de país, por ejemplo +5491122334455.'),
});

export const pinSchema = z.string().regex(PIN_PATTERN, 'El PIN debe tener entre 4 y 8 dígitos.');

export const lotNumberSchema = z
  .string()
  .trim()
  .regex(LOT_NUMBER_PATTERN, 'El lote debe tener entre 1 y 6 dígitos.');

const ownerNamesSchema = z
  .array(z.string().trim().min(2).max(OWNER_NAME_MAX_LENGTH))
  .min(1)
  .max(MAX_OWNER_NAMES);

const contactsSchema = z.array(lotContactSchema).max(MAX_CONTACTS);

export const createLotSchema = z.object({
  lotNumber: lotNumberSchema,
  ownerNames: ownerNamesSchema,
  contacts: contactsSchema.default([]),
  pin: pinSchema,
});

export const updateLotSchema = z
  .object({
    ownerNames: ownerNamesSchema,
    contacts: contactsSchema,
    active: z.boolean(),
  })
  .partial();

export const lotListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
});

export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type LotListQuery = z.infer<typeof lotListQuerySchema>;
