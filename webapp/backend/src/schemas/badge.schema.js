import { z } from 'zod';

export const scanBody = z.object({
  uid: z.string().regex(/^[0-9A-Fa-f]{8,20}$/),
});

export const confirmBody = z.object({
  token: z.string().min(1).max(100),
});
