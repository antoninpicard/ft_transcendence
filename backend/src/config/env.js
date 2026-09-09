import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    CORS_ORIGIN: z.string().optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
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
