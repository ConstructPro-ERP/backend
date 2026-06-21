import { z } from 'zod';

// Subset of user fields the user can update themselves (no role/status)
export const UpdateProfileSchema = z.object({
  fullName: z.string().min(1, 'Name cannot be blank').optional(),
  avatar: z.string().url('Avatar must be a valid URL').optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;