'use strict';
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const configs = require('../repositories/entityConfigs');
const repo = require('../repositories/crudRepository');
const activityRepo = require('../repositories/activityRepository');
const { makeContext } = require('./crudService');
const { badRequest, forbidden, conflict, notFound } = require('../utils/httpError');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 10;

// ----------------------------------------------------------------
// Alta self-service de organización (producto SaaS replicable):
// crea tenant + usuario owner + pipeline por defecto en una transacción.
// ----------------------------------------------------------------
async function signup({ organization_name, name, email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    return await db.withTransaction(async (client) => {
      const org = await client.query(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, settings`,
        [organization_name]
      );
      const orgId = org.rows[0].id;
      const user = await client.query(
        `INSERT INTO users (organization_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id, name, role`,
        [orgId, email, passwordHash, name]
      );
      await client.query('SELECT crm_create_default_pipeline($1, $2)', [orgId, user.rows[0].id]);
      await activityRepo.record(client, {
        organizationId: orgId, actorUserId: user.rows[0].id,
        entityType: 'organization', entityId: orgId, action: 'signup',
      });
      logger.info('signup_ok', { org: orgId });
      return { organization: org.rows[0], user: user.rows[0] };
    });
  } catch (err) {
    if (err.code === '23505') throw conflict('Ese email ya está registrado');
    throw err;
  }
}

// ----------------------------------------------------------------
// Gestión de usuarios del tenant (owner/admin)
// Reglas anti-lockout y anti-escalada:
// - Nadie se modifica a sí mismo por esta vía.
// - Solo un owner puede crear/modificar owners o admins.
// - No se puede desactivar/degradar al último owner activo.
// ----------------------------------------------------------------
function assertCanManageRole(actorRole, targetRole) {
  if ((targetRole === 'owner' || targetRole === 'admin') && actorRole !== 'owner') {
    throw forbidden('Solo un owner puede gestionar owners o admins');
  }
}

async function createUser(req, data) {
  const ctx = makeContext(req);
  assertCanManageRole(ctx.user.role, data.role);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  try {
    return await db.withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (organization_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, is_active, created_at`,
        [ctx.organizationId, data.email, passwordHash, data.name, data.role]
      );
      await activityRepo.record(client, {
        organizationId: ctx.organizationId, actorUserId: ctx.user.id,
        entityType: 'user', entityId: result.rows[0].id, action: 'create',
        changes: { role: data.role }, ip: ctx.ip, userAgent: ctx.userAgent,
      });
      return result.rows[0];
    });
  } catch (err) {
    if (err.code === '23505') throw conflict('Ese email ya está registrado');
    throw err;
  }
}

async function updateUser(req, userId, data) {
  const ctx = makeContext(req);
  if (userId === ctx.user.id) throw forbidden('No puedes modificar tu propia cuenta desde aquí');
  return db.withTransaction(async (client) => {
    const target = await client.query(
      `SELECT id, role, is_active FROM users
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [userId, ctx.organizationId]
    );
    if (!target.rows.length) throw notFound();
    const before = target.rows[0];
    assertCanManageRole(ctx.user.role, before.role);
    if (data.role) assertCanManageRole(ctx.user.role, data.role);

    const losesOwner = before.role === 'owner' &&
      ((data.role && data.role !== 'owner') || data.is_active === false);
    if (losesOwner) {
      const owners = await client.query(
        `SELECT count(*)::int AS n FROM users
         WHERE organization_id = $1 AND role = 'owner' AND is_active AND deleted_at IS NULL`,
        [ctx.organizationId]
      );
      if (owners.rows[0].n <= 1) throw conflict('No se puede degradar o desactivar al último owner activo');
    }

    const sets = [];
    const params = [];
    for (const field of ['name', 'role', 'is_active']) {
      if (data[field] !== undefined) {
        params.push(data[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) throw badRequest('Nada que actualizar');
    params.push(userId, ctx.organizationId);
    const result = await client.query(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND organization_id = $${params.length} AND deleted_at IS NULL
       RETURNING id, name, email, role, is_active`,
      params
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'user', entityId: userId, action: 'update',
      changes: { role: data.role, is_active: data.is_active },
      ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return result.rows[0];
  });
}

async function listUsersFull(organizationId) {
  const result = await db.query(
    `SELECT id, name, email, role, is_active, created_at FROM users
     WHERE organization_id = $1 AND deleted_at IS NULL
     ORDER BY created_at LIMIT 500`,
    [organizationId]
  );
  return result.rows;
}

// ----------------------------------------------------------------
// Ajustes/branding por organización (white-label)
// ----------------------------------------------------------------
async function getSettings(organizationId) {
  const result = await db.query(
    `SELECT name, settings FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId]
  );
  if (!result.rows.length) throw notFound();
  return { organization_name: result.rows[0].name, ...result.rows[0].settings };
}

async function updateSettings(req, data) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    // Merge server-side sobre claves ya validadas por esquema
    const result = await client.query(
      `UPDATE organizations SET settings = settings || $1::jsonb
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING name, settings`,
      [JSON.stringify(data), ctx.organizationId]
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'organization', entityId: ctx.organizationId, action: 'settings_update',
      changes: data, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { organization_name: result.rows[0].name, ...result.rows[0].settings };
  });
}

// ----------------------------------------------------------------
// Validación de campos personalizados contra las definiciones del tenant
// ----------------------------------------------------------------
async function validateCustomFields(organizationId, entityType, custom) {
  const keys = Object.keys(custom || {});
  if (!keys.length) return;
  const defs = (await db.query(
    `SELECT key, label, field_type, options FROM crm_custom_fields
     WHERE organization_id = $1 AND entity_type = $2 AND deleted_at IS NULL`,
    [organizationId, entityType]
  )).rows;
  for (const key of keys) {
    const def = defs.find((d) => d.key === key);
    if (!def) throw badRequest(`Campo personalizado desconocido: ${key}`);
    const value = custom[key];
    if (value === null) continue;
    switch (def.field_type) {
      case 'text':
        if (typeof value !== 'string') throw badRequest(`"${def.label}" debe ser texto`);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) throw badRequest(`"${def.label}" debe ser numérico`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') throw badRequest(`"${def.label}" debe ser sí/no`);
        break;
      case 'date':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`"${def.label}" debe ser una fecha (YYYY-MM-DD)`);
        break;
      case 'select': {
        const options = Array.isArray(def.options) ? def.options : [];
        if (!options.includes(value)) throw badRequest(`"${def.label}": valor no permitido`);
        break;
      }
    }
  }
}

// ----------------------------------------------------------------
// Importación masiva (CSV parseado en cliente -> filas JSON)
// Cada fila se valida con el esquema del recurso; las inválidas se
// devuelven con su error sin abortar el resto.
// ----------------------------------------------------------------
const IMPORTABLE = {
  leads: () => ({ config: configs.leads, schema: require('../validators/crm.schemas').leadCreate }),
  companies: () => ({ config: configs.companies, schema: require('../validators/crm.schemas').companyCreate }),
  contacts: () => ({ config: configs.contacts, schema: require('../validators/crm.schemas').contactCreate }),
};

async function importRows(req, resource, rows, validatePayload) {
  const ctx = makeContext(req);
  const importable = IMPORTABLE[resource];
  if (!importable) throw badRequest('Recurso no importable');
  const { config, schema } = importable();

  const valid = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = schema.safeParse(rows[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row: i + 1, error: `${issue.path.join('.') || 'fila'}: ${issue.message}` });
      continue;
    }
    try {
      await validatePayload(ctx.organizationId, config.entityType, parsed.data);
      valid.push(parsed.data);
    } catch (err) {
      errors.push({ row: i + 1, error: err.expose ? err.message : 'Fila inválida' });
    }
  }

  let created = 0;
  if (valid.length) {
    await db.withTransaction(async (client) => {
      for (const data of valid) {
        await repo.insert(config, ctx.organizationId, ctx.user.id, data, client);
        created++;
      }
      await activityRepo.record(client, {
        organizationId: ctx.organizationId, actorUserId: ctx.user.id,
        entityType: config.entityType, entityId: null, action: 'import',
        changes: { created, failed: errors.length },
        ip: ctx.ip, userAgent: ctx.userAgent,
      });
    });
  }
  return { created, failed: errors.length, errors: errors.slice(0, 50) };
}

module.exports = {
  signup, createUser, updateUser, listUsersFull,
  getSettings, updateSettings, validateCustomFields, importRows,
};
