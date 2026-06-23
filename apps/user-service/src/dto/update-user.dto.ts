import { z } from 'zod';

// All fields optional for partial updates (PATCH)
export const UpdateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  avatar: z.string().url().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;