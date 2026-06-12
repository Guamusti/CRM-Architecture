'use strict';
// Error HTTP normalizado. El mensaje es seguro para mostrar al cliente:
// nunca incluir stack traces, SQL ni detalles internos.

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

module.exports = {
  HttpError,
  badRequest: (msg = 'Petición inválida') => new HttpError(400, 'BAD_REQUEST', msg),
  unauthorized: (msg = 'No autenticado') => new HttpError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'No autorizado') => new HttpError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Recurso no encontrado') => new HttpError(404, 'NOT_FOUND', msg),
  conflict: (msg = 'Conflicto') => new HttpError(409, 'CONFLICT', msg),
};
