import { z } from 'zod';
import { normalizeIp, parseIpList, splitIpList } from '../utils/ip.js';

const blankToUndefined = (v) => (v === '' ? undefined : v);

const PLACEHOLDER = /<[^<>]*>/;

const configValue = (inner) =>
  z.preprocess(
    blankToUndefined,
    inner
      .refine((v) => !PLACEHOLDER.test(v), { message: "valeur d'exemple non remplacée" })
      .optional(),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    CORS_ORIGIN: z.string().optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    FORTYTWO_CLIENT_ID: configValue(z.string().min(1)),
    FORTYTWO_CLIENT_SECRET: configValue(z.string().min(1)),
    FORTYTWO_REDIRECT_URI: configValue(z.string().min(1)),
    FORTYTWO_API_URL: z.preprocess(blankToUndefined, z.url().default('https://api.intra.42.fr')),
    DEVICE_TOKEN: configValue(z.string().min(1)),
    BADGE_UID_SECRET: configValue(z.string().min(32, 'doit faire au moins 32 caractères')),
    BADGE_LOGIN_ALLOWED_IPS: configValue(
      z
        .string()
        .min(1)
        .refine((list) => splitIpList(list).every((entry) => normalizeIp(entry) !== null), {
          message: "doit être une liste d'adresses IP séparées par des virgules",
        }),
    ),
    FRONT_URL: z.preprocess(blankToUndefined, z.url().optional()),
  })
  .refine((c) => c.NODE_ENV !== 'production' || (c.CORS_ORIGIN && c.CORS_ORIGIN !== '*'), {
    path: ['CORS_ORIGIN'],
    message: "doit lister des origines explicites en production ('*' est refusé)",
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuration invalide :');
  console.error(JSON.stringify(z.treeifyError(parsed.error), null, 2));
  process.exit(1);
}

const corsOrigin = parsed.data.CORS_ORIGIN ?? '*';

export const env = {
  ...parsed.data,
  CORS_ORIGIN: corsOrigin,
  FORTYTWO_API_URL: parsed.data.FORTYTWO_API_URL.replace(/\/+$/, ''),
  FRONT_URL: (parsed.data.FRONT_URL ?? '').replace(/\/+$/, ''),
  fortyTwoConfigured: Boolean(
    parsed.data.FORTYTWO_CLIENT_ID &&
      parsed.data.FORTYTWO_CLIENT_SECRET &&
      parsed.data.FORTYTWO_REDIRECT_URI,
  ),
  badgeConfigured: Boolean(parsed.data.DEVICE_TOKEN && parsed.data.BADGE_UID_SECRET),
  badgeLoginAllowedIps: parseIpList(parsed.data.BADGE_LOGIN_ALLOWED_IPS),
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins:
    corsOrigin === '*'
      ? '*'
      : corsOrigin
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
  corsCredentials: corsOrigin !== '*',
};
