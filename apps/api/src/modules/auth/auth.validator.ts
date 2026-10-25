import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
