import { z } from 'zod';

export const codeBody = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
});
