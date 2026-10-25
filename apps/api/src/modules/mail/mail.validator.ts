import { z } from 'zod';
import { lotNumberSchema } from '../lots/lots.validator.js';
import { MAIL_LIMITS } from './mail-item.model.js';

export const descriptionSchema = z
  .string()
  .trim()
  .max(
    MAIL_LIMITS.descriptionMaxLength,
    `La descripción no puede superar ${MAIL_LIMITS.descriptionMaxLength} caracteres.`,
  );

export const createMailSchema = z.object({
  lotNumber: lotNumberSchema,
  description: descriptionSchema.optional(),
  receivedAt: z.coerce.date().optional(),
});

export type CreateMailInput = z.infer<typeof createMailSchema>;
