'use strict';
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

function makeLimiter({ windowMs, max, name }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.security('rate_limit_exceeded', { limiter: name, ip: req.ip, path: req.originalUrl });
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Demasiadas peticiones, inténtalo más tarde' } });
    },
  });
}

module.exports = {
  // Login: estricto contra fuerza bruta
  authLimiter: makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, name: 'auth' }),
  // API general
  apiLimiter: makeLimiter({ windowMs: 60 * 1000, max: 300, name: 'api' }),
  // Escrituras CRM
  writeLimiter: makeLimiter({ windowMs: 60 * 1000, max: 60, name: 'crm-write' }),
};
