import { z } from 'zod';

export const CreateUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Must be a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .optional(),

  // Optional because user creation should not depend on role assignment.
  roleId: z.string().min(1, 'Role ID is required').optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
