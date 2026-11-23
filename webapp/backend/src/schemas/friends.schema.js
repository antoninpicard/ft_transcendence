import { z } from 'zod';

export const friendRequestBody = z.object({ userId: z.uuid().toLowerCase() });

export const userIdParams = z.object({ userId: z.uuid().toLowerCase() });
