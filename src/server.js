'use strict';
const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const { pool } = require('./config/db');

const server = app.listen(env.port, () => {
  logger.info('Servidor CRM Zyra escuchando', { port: env.port, env: env.nodeEnv });
});

function shutdown(signal) {
  logger.info('Apagado limpio', { signal });
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
