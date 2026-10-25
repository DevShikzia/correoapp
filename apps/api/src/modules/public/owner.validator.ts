import { z } from 'zod';
import { lotNumberSchema, pinSchema } from '../lots/lots.validator.js';

export const ownerAccessSchema = z.object({
  lotNumber: lotNumberSchema,
  pin: pinSchema,
});

export type OwnerAccessInput = z.infer<typeof ownerAccessSchema>;
