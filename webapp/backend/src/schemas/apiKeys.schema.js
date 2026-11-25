import { z } from 'zod';

export const createKeyBody = z.object({ name: z.string().trim().min(1).max(50) });

export const keyIdParams = z.object({ id: z.uuid().toLowerCase() });
