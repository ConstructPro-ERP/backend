import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Must be a valid email address'),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;