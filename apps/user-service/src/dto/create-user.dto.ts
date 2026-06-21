import { z } from 'zod';

export const CreateUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Must be a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .optional(),
  roleId: z.string().min(1, 'Role ID is required'),
  avatar: z.string().url('Avatar must be a valid URL').optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;