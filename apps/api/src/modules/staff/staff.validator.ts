import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from './staff.constants.js';
import { STAFF_ROLES } from './staff.roles.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.',
  );

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH);

export const createStaffSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(STAFF_ROLES),
});

export const updateStaffSchema = z
  .object({
    role: z.enum(STAFF_ROLES),
    active: z.boolean(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Indicá al menos un cambio.',
  });

export const staffListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
