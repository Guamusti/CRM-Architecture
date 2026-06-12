'use strict';
const logger = require('../utils/logger');

// Manejo centralizado de errores. Nunca expone stack traces ni
// detalles internos (SQL, rutas de fichero) al cliente.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.expose && err.status) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // Violaciones de constraint conocidas -> mensajes seguros
  if (err.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Ya existe un registro con esos datos' } });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Referencia a un registro inexistente' } });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Valor no permitido para uno de los campos' } });
  }
  logger.error('Error no controlado', {
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}

module.exports = { errorHandler, notFoundHandler };
