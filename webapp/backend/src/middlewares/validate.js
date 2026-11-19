import { AppError } from '../utils/AppError.js';

export function validate(schemas) {
  return (req, _res, next) => {
    for (const source of ['body', 'params', 'query']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (!result.success) {
        return next(
          AppError.badRequest(`Données invalides dans ${source}`, z_flatten(result.error)),
        );
      }
      if (source === 'query') req.validatedQuery = result.data;
      else req[source] = result.data;
    }
    return next();
  };
}

function z_flatten(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
