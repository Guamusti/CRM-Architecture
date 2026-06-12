'use strict';
const db = require('../config/db');
const repo = require('../repositories/crudRepository');
const activityRepo = require('../repositories/activityRepository');
const { isLimitedRole } = require('../middlewares/permissions');
const { notFound, forbidden } = require('../utils/httpError');
const logger = require('../utils/logger');

// Servicio CRUD genérico. Garantías transversales:
// - Tenant: organization_id sale SIEMPRE del JWT (req.user), nunca del payload.
// - Scoping worker: solo ve/edita registros asignados a él (scopeField).
// - Auditoría: toda mutación registra actividad en la misma transacción.

function makeContext(req) {
  return {
    organizationId: req.user.organizationId,
    user: req.user,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function workerScope(config, ctx, filters) {
  if (config.scopeField && isLimitedRole(ctx.user.role)) {
    // Forzar el filtro de asignación: ignora cualquier valor del cliente.
    return { ...filters, [filterKeyForScope(config)]: ctx.user.id };
  }
  return filters;
}

function filterKeyForScope(config) {
  // El scopeField siempre está declarado como filtrable bajo su propio nombre
  // (owner_user_id, assigned_to) o se filtra a posteriori en getById.
  const entry = Object.entries(config.filterable).find(([, v]) => v.column === config.scopeField);
  return entry ? entry[0] : config.scopeField;
}

function assertWorkerCanAccess(config, ctx, row) {
  if (!config.scopeField || !isLimitedRole(ctx.user.role)) return;
  const ownerValue = row[config.scopeField];
  if (ownerValue !== ctx.user.id && row.created_by !== ctx.user.id) {
    logger.security('scoped_access_denied', {
      userId: ctx.user.id, org: ctx.organizationId,
      entity: config.entityType, entityId: row.id,
    });
    throw forbidden();
  }
}

function diffChanges(before, after, data) {
  const changes = {};
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) continue;
    if (!before || JSON.stringify(before[key]) !== JSON.stringify(after?.[key])) {
      changes[key] = { from: before ? before[key] : null, to: after ? after[key] : data[key] };
    }
  }
  return changes;
}

function createService(config) {
  return {
    config,

    async list(req, pagination) {
      const ctx = makeContext(req);
      const filters = workerScope(config, ctx, req.query);
      return repo.list(config, ctx.organizationId, {
        filters,
        search: req.query.search,
        sort: req.query.sort,
        order: req.query.order,
        pageSize: pagination.pageSize,
        offset: pagination.offset,
      });
    },

    async getById(req, id) {
      const ctx = makeContext(req);
      const row = await repo.getById(config, ctx.organizationId, id);
      if (!row) throw notFound();
      assertWorkerCanAccess(config, ctx, row);
      return row;
    },

    async create(req, data) {
      const ctx = makeContext(req);
      return db.withTransaction(async (client) => {
        const row = await repo.insert(config, ctx.organizationId, ctx.user.id, data, client);
        await activityRepo.record(client, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.user.id,
          entityType: config.entityType,
          entityId: row.id,
          action: 'create',
          changes: diffChanges(null, row, data),
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        return row;
      });
    },

    async update(req, id, data, action = 'update') {
      const ctx = makeContext(req);
      return db.withTransaction(async (client) => {
        const before = await repo.getById(config, ctx.organizationId, id, client);
        if (!before) throw notFound();
        assertWorkerCanAccess(config, ctx, before);
        const after = await repo.update(config, ctx.organizationId, ctx.user.id, id, data, client);
        if (!after) throw notFound();
        await activityRepo.record(client, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.user.id,
          entityType: config.entityType,
          entityId: id,
          action: data.owner_user_id !== undefined || data.assigned_to !== undefined ? 'assign' : action,
          changes: diffChanges(before, after, data),
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        return after;
      });
    },

    async remove(req, id) {
      const ctx = makeContext(req);
      return db.withTransaction(async (client) => {
        const before = await repo.getById(config, ctx.organizationId, id, client);
        if (!before) throw notFound();
        assertWorkerCanAccess(config, ctx, before);
        const deleted = await repo.softDelete(config, ctx.organizationId, ctx.user.id, id, client);
        if (!deleted) throw notFound();
        await activityRepo.record(client, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.user.id,
          entityType: config.entityType,
          entityId: id,
          action: 'delete',
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        return { id };
      });
    },
  };
}

module.exports = { createService, makeContext };
