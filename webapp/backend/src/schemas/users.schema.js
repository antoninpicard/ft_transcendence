import { z } from 'zod';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const idParams = z.object({ id: z.uuid().toLowerCase() });

export const userBody = z.object({
  username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME_PATTERN),
  email: z.email(),
});

// Theme of the front: an id of its theme list (lowercase letters and dashes). It is only
// presentation, so the list itself lives in the front (src/theme.js)
export const THEME_PATTERN = /^[a-z][a-z-]{0,29}$/;

// PATCH can also change the theme; PUT replaces the identity fields only (username, email)
export const userPatchBody = userBody.partial().extend({
  theme: z.string().regex(THEME_PATTERN).optional(),
});

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
