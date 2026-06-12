'use strict';
const db = require('../config/db');

// Repositorio CRUD genérico multi-tenant.
// Seguridad:
// - Todas las queries son parametrizadas ($1, $2…): inmune a SQL injection.
// - Los nombres de columna NUNCA vienen del usuario: salen de las
//   whitelists declaradas en cada config (columns/filterable/sortable).
// - Toda query filtra por organization_id Y deleted_at IS NULL:
//   imposible leer/modificar datos de otro tenant (anti-IDOR).

function buildFilters(config, filters, params) {
  const clauses = [];
  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined) continue;
    const col = config.filterable[key];
    if (!col) continue; // solo filtros declarados
    if (col.op === 'lte') {
      params.push(value);
      clauses.push(`${col.column} <= $${params.length}`);
    } else {
      params.push(value);
      clauses.push(`${col.column} = $${params.length}`);
    }
  }
  return clauses;
}

function buildSearch(config, search, params) {
  if (!search || !config.searchable?.length) return null;
  params.push(`%${search}%`);
  const idx = params.length;
  return '(' + config.searchable.map((c) => `${c} ILIKE $${idx}`).join(' OR ') + ')';
}

function resolveSort(config, sort, order) {
  const column = config.sortable[sort] || config.defaultSort;
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${dir}`;
}

async function list(config, organizationId, { filters, search, sort, order, pageSize, offset }) {
  const params = [organizationId];
  const where = ['organization_id = $1', 'deleted_at IS NULL'];
  where.push(...buildFilters(config, filters, params));
  const searchClause = buildSearch(config, search, params);
  if (searchClause) where.push(searchClause);

  const whereSql = where.join(' AND ');
  const countResult = await db.query(
    `SELECT count(*)::int AS total FROM ${config.table} WHERE ${whereSql}`, params
  );

  params.push(pageSize, offset);
  const rows = await db.query(
    `SELECT ${config.selectColumns} FROM ${config.table}
     WHERE ${whereSql}
     ORDER BY ${resolveSort(config, sort, order)}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows: rows.rows, total: countResult.rows[0].total };
}

async function getById(config, organizationId, id, client = db) {
  const result = await client.query(
    `SELECT ${config.selectColumns} FROM ${config.table}
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, organizationId]
  );
  return result.rows[0] || null;
}

function pickColumns(config, data) {
  const entries = Object.entries(data).filter(
    ([key, value]) => config.columns.includes(key) && value !== undefined
  );
  return entries;
}

async function insert(config, organizationId, userId, data, client) {
  const entries = pickColumns(config, data);
  const cols = ['organization_id', 'created_by', 'updated_by', ...entries.map(([k]) => k)];
  const values = [organizationId, userId, userId, ...entries.map(([, v]) => v)];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const result = await client.query(
    `INSERT INTO ${config.table} (${cols.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING ${config.selectColumns}`,
    values
  );
  return result.rows[0];
}

async function update(config, organizationId, userId, id, data, client) {
  const entries = pickColumns(config, data);
  if (entries.length === 0) return getById(config, organizationId, id, client);
  const params = [];
  const sets = entries.map(([k, v]) => {
    params.push(v);
    return `${k} = $${params.length}`;
  });
  params.push(userId);
  sets.push(`updated_by = $${params.length}`);
  params.push(id, organizationId);
  const result = await client.query(
    `UPDATE ${config.table} SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND organization_id = $${params.length}
       AND deleted_at IS NULL
     RETURNING ${config.selectColumns}`,
    params
  );
  return result.rows[0] || null;
}

async function softDelete(config, organizationId, userId, id, client) {
  const result = await client.query(
    `UPDATE ${config.table} SET deleted_at = now(), updated_by = $1
     WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
     RETURNING id`,
    [userId, id, organizationId]
  );
  return result.rows[0] || null;
}

module.exports = { list, getById, insert, update, softDelete };
