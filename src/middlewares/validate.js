'use strict';
const { ZodError } = require('zod');
const { badRequest } = require('../utils/httpError');

// Valida body/query/params con esquemas zod .strict():
// - rechaza campos no declarados (anti mass-assignment)
// - aplica límites de longitud y tipos
// Sustituye req[target] por la versión parseada/saneada.
function validate(target, schema) {
  return (req, res, next) => {
    try {
      req[target] = schema.parse(req[target] ?? {});
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; ');
        return next(badRequest(`Validación fallida: ${details}`));
      }
      return next(err);
    }
  };
}

module.exports = {
  validateBody: (schema) => validate('body', schema),
  validateQuery: (schema) => validate('query', schema),
  validateParams: (schema) => validate('params', schema),
};
