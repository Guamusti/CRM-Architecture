'use strict';
const db = require('../config/db');
const configs = require('../repositories/entityConfigs');
const repo = require('../repositories/crudRepository');
const activityRepo = require('../repositories/activityRepository');
const { createService, makeContext } = require('./crudService');
const { notFound, badRequest, conflict } = require('../utils/httpError');

const companies = createService(configs.companies);
const contacts = createService(configs.contacts);
const leads = createService(configs.leads);
const opportunities = createService(configs.opportunities);
const stages = createService(configs.stages);
const tasks = createService(configs.tasks);
const notes = createService(configs.notes);
const products = createService(configs.products);
const customFields = createService(configs.customFields);

// ----------------------------------------------------------------
// Validación de referencias cruzadas dentro del tenant: evita
// asociar registros de otra organización (IDOR por FK).
// ----------------------------------------------------------------
const REF_CONFIGS = {
  company_id: configs.companies,
  contact_id: configs.contacts,
  lead_id: configs.leads,
  stage_id: configs.stages,
  product_id: configs.products,
};

const ENTITY_TYPE_CONFIGS = {
  lead: configs.leads,
  company: configs.companies,
  contact: configs.contacts,
  opportunity: configs.opportunities,
};

async function assertRefsInTenant(organizationId, data) {
  for (const [field, cfg] of Object.entries(REF_CONFIGS)) {
    if (data[field]) {
      const row = await repo.getById(cfg, organizationId, data[field]);
      if (!row) throw badRequest(`${field} no existe en esta organización`);
    }
  }
  // Referencias polimórficas (notas/tareas sobre entidades CRM)
  if (data.entity_type && data.entity_id) {
    const cfg = ENTITY_TYPE_CONFIGS[data.entity_type];
    if (!cfg) throw badRequest('entity_type no válido');
    const row = await repo.getById(cfg, organizationId, data.entity_id);
    if (!row) throw badRequest('La entidad referenciada no existe en esta organización');
  }
  if (data.owner_user_id || data.assigned_to) {
    const userId = data.owner_user_id || data.assigned_to;
    const result = await db.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND is_active`,
      [userId, organizationId]
    );
    if (result.rows.length === 0) throw badRequest('El usuario asignado no existe en esta organización');
  }
}

// Validación completa de un payload de entidad: referencias dentro del
// tenant + valores de campos personalizados contra sus definiciones.
async function validatePayload(organizationId, entityType, data) {
  await assertRefsInTenant(organizationId, data);
  if (data.custom !== undefined) {
    const { validateCustomFields } = require('./adminService');
    await validateCustomFields(organizationId, entityType, data.custom);
  }
}

// ----------------------------------------------------------------
// Cierre de oportunidades (won/lost): flujo controlado, auditado.
// ----------------------------------------------------------------
async function closeOpportunity(req, id, { status, lost_reason }) {
  const ctx = makeContext(req);
  if (status === 'lost' && !lost_reason) {
    throw badRequest('lost_reason es obligatorio al marcar como perdida');
  }
  return db.withTransaction(async (client) => {
    const before = await repo.getById(configs.opportunities, ctx.organizationId, id, client);
    if (!before) throw notFound();
    if (before.status !== 'open') throw conflict('La oportunidad ya está cerrada');
    const result = await client.query(
      `UPDATE crm_opportunities
       SET status = $1, lost_reason = $2, closed_at = now(),
           probability = CASE WHEN $1 = 'won' THEN 100 ELSE 0 END,
           updated_by = $3
       WHERE id = $4 AND organization_id = $5 AND deleted_at IS NULL
       RETURNING ${configs.opportunities.selectColumns}`,
      [status, status === 'lost' ? lost_reason : null, ctx.user.id, id, ctx.organizationId]
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.user.id,
      entityType: 'opportunity',
      entityId: id,
      action: status === 'won' ? 'close_won' : 'close_lost',
      changes: { status: { from: 'open', to: status }, lost_reason: lost_reason || null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return result.rows[0];
  });
}

// ----------------------------------------------------------------
// Pipeline: etapas + oportunidades abiertas agrupadas (kanban).
// ----------------------------------------------------------------
async function getPipeline(req) {
  const ctx = makeContext(req);
  const stagesResult = await db.query(
    `SELECT id, name, position, probability_default, is_won, is_lost, color
     FROM crm_pipeline_stages
     WHERE organization_id = $1 AND deleted_at IS NULL
     ORDER BY position ASC`,
    [ctx.organizationId]
  );
  const oppsResult = await db.query(
    `SELECT o.id, o.title, o.stage_id, o.amount, o.currency, o.probability,
            o.priority, o.expected_close_date, o.next_follow_up_at,
            o.owner_user_id, u.name AS owner_name, c.name AS company_name
     FROM crm_opportunities o
     LEFT JOIN users u ON u.id = o.owner_user_id
     LEFT JOIN crm_companies c ON c.id = o.company_id
     WHERE o.organization_id = $1 AND o.deleted_at IS NULL AND o.status = 'open'
     ORDER BY o.next_follow_up_at NULLS LAST
     LIMIT 500`,
    [ctx.organizationId]
  );
  const byStage = {};
  for (const stage of stagesResult.rows) byStage[stage.id] = [];
  for (const opp of oppsResult.rows) {
    if (byStage[opp.stage_id]) byStage[opp.stage_id].push(opp);
  }
  return {
    stages: stagesResult.rows.map((s) => ({ ...s, opportunities: byStage[s.id] || [] })),
  };
}

// ----------------------------------------------------------------
// Dashboard: métricas comerciales básicas del tenant.
// ----------------------------------------------------------------
async function getDashboard(req) {
  const ctx = makeContext(req);
  const org = ctx.organizationId;
  const [leadsByStatus, oppSummary, tasksSummary, followUps] = await Promise.all([
    db.query(
      `SELECT status, count(*)::int AS count FROM crm_leads
       WHERE organization_id = $1 AND deleted_at IS NULL GROUP BY status`, [org]
    ),
    db.query(
      `SELECT
         count(*) FILTER (WHERE status = 'open')::int AS open_count,
         coalesce(sum(amount) FILTER (WHERE status = 'open'), 0) AS open_value,
         coalesce(sum(amount * coalesce(probability,0) / 100.0) FILTER (WHERE status = 'open'), 0) AS weighted_value,
         count(*) FILTER (WHERE status = 'won'  AND closed_at >= date_trunc('month', now()))::int AS won_this_month,
         coalesce(sum(amount) FILTER (WHERE status = 'won' AND closed_at >= date_trunc('month', now())), 0) AS won_value_this_month,
         count(*) FILTER (WHERE status = 'lost' AND closed_at >= date_trunc('month', now()))::int AS lost_this_month
       FROM crm_opportunities
       WHERE organization_id = $1 AND deleted_at IS NULL`, [org]
    ),
    db.query(
      `SELECT
         count(*) FILTER (WHERE status IN ('pending','in_progress'))::int AS open_tasks,
         count(*) FILTER (WHERE status IN ('pending','in_progress') AND due_at < now())::int AS overdue_tasks
       FROM crm_tasks
       WHERE organization_id = $1 AND deleted_at IS NULL`, [org]
    ),
    db.query(
      `SELECT id, title, next_follow_up_at, status, priority
       FROM crm_leads
       WHERE organization_id = $1 AND deleted_at IS NULL
         AND status NOT IN ('converted','lost','unqualified')
         AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= now() + interval '7 days'
       ORDER BY next_follow_up_at ASC LIMIT 10`, [org]
    ),
  ]);
  const won = oppSummary.rows[0].won_this_month;
  const lost = oppSummary.rows[0].lost_this_month;
  return {
    leads_by_status: leadsByStatus.rows,
    opportunities: {
      ...oppSummary.rows[0],
      win_rate_this_month: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    },
    tasks: tasksSummary.rows[0],
    upcoming_follow_ups: followUps.rows,
  };
}

module.exports = {
  companies, contacts, leads, opportunities, stages, tasks, notes, products, customFields,
  assertRefsInTenant, validatePayload, closeOpportunity, getPipeline, getDashboard,
  listActivities: activityRepo.listActivities,
};
