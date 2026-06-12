'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');
const { unauthorized } = require('../utils/httpError');

// Autenticación obligatoria. Payload esperado:
//   { sub: userId, org: organizationId, role, name }
// Al integrar con Zyra, este middleware es el único punto a adaptar
// al formato de token existente.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return next(unauthorized());
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (!payload.sub || !payload.org || !payload.role) {
      logger.security('jwt_payload_invalid', { ip: req.ip });
      return next(unauthorized());
    }
    req.user = {
      id: payload.sub,
      organizationId: payload.org,
      role: payload.role,
      name: payload.name,
    };
    return next();
  } catch (err) {
    logger.security('jwt_invalid', { ip: req.ip, reason: err.name });
    return next(unauthorized());
  }
}

module.exports = { requireAuth };
