export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Authentification requise') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Accès refusé') {
    return new AppError(403, message);
  }

  static notFound(message = 'Ressource introuvable') {
    return new AppError(404, message);
  }

  static methodNotAllowed(message = 'Méthode non autorisée') {
    return new AppError(405, message);
  }

  static conflict(message, details) {
    return new AppError(409, message, details);
  }
}
