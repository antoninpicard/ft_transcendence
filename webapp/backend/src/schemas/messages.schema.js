import { z } from 'zod';

export const MESSAGE_MAX = 2000;

export const messageBody = z.object({ body: z.string().trim().min(1).max(MESSAGE_MAX) });

export const conversationQuery = z
  .object({
    after: z.uuid().toLowerCase().optional(),
    before: z.uuid().toLowerCase().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => !(q.after && q.before), {
    message: 'after et before sont incompatibles',
    path: ['before'],
  });
