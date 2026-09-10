import { z } from 'zod';
import { USERNAME_MIN, USERNAME_MAX, USERNAME_PATTERN } from './users.schema.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const registerBody = z.object({
  username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME_PATTERN),
  email: z.email(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const loginBody = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});
