'use strict';
const logger = require('../utils/logger');
const { forbidden } = require('../utils/httpError');

// Matriz de permisos del CRM (server-side, fuente única de verdad).
// Acciones: crm:read, crm:create, crm:update, crm:delete,
//           crm:assign, crm:close, crm:pipeline:manage
// 'caja' no tiene acceso al CRM.
const ROLE_PERMISSIONS = {
  owner:   ['crm:read', 'crm:create', 'crm:update', 'crm:delete', 'crm:assign', 'crm:close', 'crm:pipeline:manage', 'crm:export', 'crm:gdpr:manage', 'crm:admin', 'crm:import'],
  admin:   ['crm:read', 'crm:create', 'crm:update', 'crm:delete', 'crm:assign', 'crm:close', 'crm:pipeline:manage', 'crm:export', 'crm:gdpr:manage', 'crm:admin', 'crm:import'],
  manager: ['crm:read', 'crm:create', 'crm:update', 'crm:assign', 'crm:close', 'crm:export', 'crm:import'],
  // worker: lectura limitada a lo asignado (scoping adicional en servicios),
  // crear notas/tareas y actualizar estado.
  worker:  ['crm:read', 'crm:create:limited', 'crm:update:limited'],
  caja:    [],
};

function hasPermission(role, action) {
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes(action)) return true;
  // ':limited' satisface la acción base; el servicio aplica el scoping.
  return perms.includes(`${action}:limited`);
}

// El scoping "solo lo asignado" se aplica en la capa de servicio.
function isLimitedRole(role) {
  return role === 'worker';
}

function requirePermission(action) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, action)) {
      logger.security('permission_denied', {
        userId: req.user?.id,
        org: req.user?.organizationId,
        role: req.user?.role,
        action,
        path: req.originalUrl,
        ip: req.ip,
      });
      return next(forbidden());
    }
    return next();
  };
}

module.exports = { requirePermission, hasPermission, isLimitedRole, ROLE_PERMISSIONS };
