'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { apiLimiter } = require('./middlewares/rateLimit');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./routes/auth');
const crmRoutes = require('./routes/crm');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás de proxy/Supabase/CDN: IP real para rate limit

// Cabeceras de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Librerías self-hosted en /vendor; el runtime de Tailwind
      // inyecta un <style>, de ahí el unsafe-inline en estilos.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// CORS: solo orígenes declarados. Auth por header Bearer (sin cookies),
// por lo que no hay superficie CSRF; aún así no se permiten credenciales.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '100kb' }));
app.use(apiLimiter);

// Frontend CRM (estático, sin build). La lógica de permisos vive en el
// backend; el frontend solo oculta controles como mejora de UX.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/crm', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'crm.html')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/crm', crmRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
