export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_NOT_NULL_VIOLATION = '23502';

export function isUniqueViolation(err, constraint) {
  if (err?.code !== PG_UNIQUE_VIOLATION) return false;
  return constraint ? err.constraint === constraint : true;
}
