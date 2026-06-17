'use strict';
const db = require('../config/db');
const configs = require('../repositories/entityConfigs');
const repo = require('../repositories/crudRepository');
const activityRepo = require('../repositories/activityRepository');
const { makeContext } = require('./crudService');
const { notFound, badRequest, conflict } = require('../utils/httpError');

const ITEM_COLS = `id, opportunity_id, product_id, name, quantity, unit_price,
  discount_percent, line_total, position, created_at, updated_at`;

// Recalcula el importe de la oportunidad a partir de sus líneas y lo
// marca como derivado. Único punto que escribe amount cuando hay líneas.
async function recalcAmount(client, organizationId, opportunityId, userId) {
  const sum = await client.query(
    `SELECT coalesce(sum(line_total), 0) AS total
     FROM crm_opportunity_items
     WHERE organization_id = $1 AND opportunity_id = $2`,
    [organizationId, opportunityId]
  );
  const total = sum.rows[0].total;
  await client.query(
    `UPDATE crm_opportunities
     SET amount = $1, amount_is_derived = true, updated_by = $2
     WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL`,
    [total, userId, opportunityId, organizationId]
  );
  return total;
}

// Carga la oportunidad asegurando tenant; lanza 404 si no es del tenant.
async function loadOpportunity(client, organizationId, opportunityId) {
  const opp = await repo.getById(configs.opportunities, organizationId, opportunityId, client);
  if (!opp) throw notFound();
  return opp;
}

async function listItems(req, opportunityId) {
  const ctx = makeContext(req);
  await loadOpportunity(db, ctx.organizationId, opportunityId);
  const result = await db.query(
    `SELECT ${ITEM_COLS} FROM crm_opportunity_items
     WHERE organization_id = $1 AND opportunity_id = $2
     ORDER BY position ASC, created_at ASC`,
    [ctx.organizationId, opportunityId]
  );
  const total = result.rows.reduce((acc, r) => acc + Number(r.line_total), 0);
  return { items: result.rows, total };
}

async function addItem(req, opportunityId, data) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const opp = await loadOpportunity(client, ctx.organizationId, opportunityId);
    if (opp.status !== 'open') throw conflict('No se pueden modificar líneas de una oportunidad cerrada');

    // Si la línea referencia un producto del catálogo, se valida que sea
    // del tenant y se rellenan nombre/precio desde el catálogo si faltan.
    let { name, unit_price } = data;
    if (data.product_id) {
      const product = await repo.getById(configs.products, ctx.organizationId, data.product_id, client);
      if (!product) throw badRequest('El producto no existe en esta organización');
      if (!name) name = product.name;
      if (unit_price === undefined) unit_price = product.price ?? 0;
    }
    if (!name) throw badRequest('Indica un producto o un nombre de línea');

    const inserted = await client.query(
      `INSERT INTO crm_opportunity_items
         (organization_id, opportunity_id, product_id, name, quantity, unit_price, discount_percent, position, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
       RETURNING ${ITEM_COLS}`,
      [ctx.organizationId, opportunityId, data.product_id || null, name,
       data.quantity ?? 1, unit_price ?? 0, data.discount_percent ?? 0, data.position ?? 0, ctx.user.id]
    );
    const total = await recalcAmount(client, ctx.organizationId, opportunityId, ctx.user.id);
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'opportunity', entityId: opportunityId, action: 'item_add',
      changes: { item: inserted.rows[0].name, line_total: inserted.rows[0].line_total },
      ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { item: inserted.rows[0], opportunity_total: total };
  });
}

async function updateItem(req, opportunityId, itemId, data) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const opp = await loadOpportunity(client, ctx.organizationId, opportunityId);
    if (opp.status !== 'open') throw conflict('No se pueden modificar líneas de una oportunidad cerrada');
    if (data.product_id) {
      const product = await repo.getById(configs.products, ctx.organizationId, data.product_id, client);
      if (!product) throw badRequest('El producto no existe en esta organización');
    }
    const fields = ['product_id', 'name', 'quantity', 'unit_price', 'discount_percent', 'position'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (data[f] !== undefined) { params.push(data[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (!sets.length) throw badRequest('Nada que actualizar');
    params.push(ctx.user.id);
    sets.push(`updated_by = $${params.length}`);
    params.push(itemId, opportunityId, ctx.organizationId);
    const updated = await client.query(
      `UPDATE crm_opportunity_items SET ${sets.join(', ')}
       WHERE id = $${params.length - 2} AND opportunity_id = $${params.length - 1} AND organization_id = $${params.length}
       RETURNING ${ITEM_COLS}`,
      params
    );
    if (!updated.rows.length) throw notFound();
    const total = await recalcAmount(client, ctx.organizationId, opportunityId, ctx.user.id);
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'opportunity', entityId: opportunityId, action: 'item_update',
      changes: { item: updated.rows[0].name }, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { item: updated.rows[0], opportunity_total: total };
  });
}

async function removeItem(req, opportunityId, itemId) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const opp = await loadOpportunity(client, ctx.organizationId, opportunityId);
    if (opp.status !== 'open') throw conflict('No se pueden modificar líneas de una oportunidad cerrada');
    const deleted = await client.query(
      `DELETE FROM crm_opportunity_items
       WHERE id = $1 AND opportunity_id = $2 AND organization_id = $3 RETURNING name`,
      [itemId, opportunityId, ctx.organizationId]
    );
    if (!deleted.rows.length) throw notFound();
    const total = await recalcAmount(client, ctx.organizationId, opportunityId, ctx.user.id);
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'opportunity', entityId: opportunityId, action: 'item_remove',
      changes: { item: deleted.rows[0].name }, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { opportunity_total: total };
  });
}

// ----------------------------------------------------------------
// Forecast: oportunidades abiertas agrupadas por mes de cierre previsto,
// con valor bruto y ponderado por probabilidad, más lo ya ganado por mes.
// ----------------------------------------------------------------
async function getForecast(req, { months = 6, owner_user_id } = {}) {
  const ctx = makeContext(req);
  const params = [ctx.organizationId, months];
  let ownerFilter = '';
  if (owner_user_id) { params.push(owner_user_id); ownerFilter = `AND owner_user_id = $${params.length}`; }

  const open = await db.query(
    `SELECT to_char(date_trunc('month', expected_close_date), 'YYYY-MM') AS month,
            count(*)::int AS count,
            coalesce(sum(amount), 0) AS open_value,
            coalesce(sum(amount * coalesce(probability, 0) / 100.0), 0) AS weighted_value
     FROM crm_opportunities
     WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'open'
       AND expected_close_date IS NOT NULL
       AND expected_close_date < (date_trunc('month', now()) + ($2 || ' months')::interval)
       ${ownerFilter}
     GROUP BY 1 ORDER BY 1`,
    params
  );
  const won = await db.query(
    `SELECT to_char(date_trunc('month', closed_at), 'YYYY-MM') AS month,
            count(*)::int AS count, coalesce(sum(amount), 0) AS won_value
     FROM crm_opportunities
     WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'won'
       AND closed_at >= (date_trunc('month', now()) - ($2 || ' months')::interval)
       ${ownerFilter}
     GROUP BY 1 ORDER BY 1`,
    params
  );

  const noDate = await db.query(
    `SELECT count(*)::int AS count, coalesce(sum(amount), 0) AS open_value
     FROM crm_opportunities
     WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'open'
       AND expected_close_date IS NULL ${ownerFilter}`,
    owner_user_id ? [ctx.organizationId, owner_user_id] : [ctx.organizationId]
  );

  return {
    open_by_month: open.rows,
    won_by_month: won.rows,
    open_without_date: noDate.rows[0],
  };
}

module.exports = { listItems, addItem, updateItem, removeItem, getForecast, recalcAmount };
