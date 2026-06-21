import { z } from 'zod';

// Schema drives both runtime validation and TypeScript type inference
export const RegisterSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  email: z.string().email('Must be a valid email address'),
  roleId: z.string().min(1, 'Role ID is required'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;