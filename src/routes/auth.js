'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { unauthorized } = require('../utils/httpError');
const { validateBody } = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimit');

// Auth mínima standalone. Al integrar con Zyra se sustituye este
// módulo por el login existente; el resto del CRM solo depende del
// formato de token { sub, org, role, name }.

const router = express.Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
}).strict();

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await db.query(
      `SELECT u.id, u.organization_id, u.password_hash, u.role, u.name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id AND o.deleted_at IS NULL
       WHERE u.email = $1 AND u.deleted_at IS NULL AND u.is_active
       LIMIT 1`,
      [email]
    );
    const user = result.rows[0];
    // Comparación siempre ejecutada para no filtrar existencia por timing
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      logger.security('login_failed', { ip: req.ip });
      return next(unauthorized('Credenciales inválidas'));
    }
    const token = jwt.sign(
      { sub: user.id, org: user.organization_id, role: user.role, name: user.name },
      env.jwtSecret,
      { algorithm: 'HS256', expiresIn: env.jwtExpiresIn }
    );
    logger.info('login_ok', { userId: user.id, org: user.organization_id });
    res.json({ data: { token, user: { id: user.id, name: user.name, role: user.role } } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
