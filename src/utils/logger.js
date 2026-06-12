'use strict';
// Logger estructurado mínimo (JSON por línea).
// REGLA: nunca loguear datos personales (emails, teléfonos, nombres de
// contactos) ni tokens. Solo IDs, acciones y metadatos técnicos.

function log(level, msg, meta) {
  const entry = { level, time: new Date().toISOString(), msg, ...(meta || {}) };
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  // Eventos de seguridad (login fallido, acceso denegado, intento IDOR…)
  security: (event, meta) => log('warn', `SECURITY:${event}`, meta),
};
