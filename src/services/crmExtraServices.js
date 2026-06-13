'use strict';
const db = require('../config/db');
const configs = require('../repositories/entityConfigs');
const repo = require('../repositories/crudRepository');
const activityRepo = require('../repositories/activityRepository');
const { makeContext } = require('./crudService');
const { notFound, badRequest, conflict } = require('../utils/httpError');

// ----------------------------------------------------------------
// Conversión lead -> oportunidad (transaccional, auditada)
// ----------------------------------------------------------------
async function convertLead(req, leadId, data) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const lead = await repo.getById(configs.leads, ctx.organizationId, leadId, client);
    if (!lead) throw notFound();
    if (lead.status === 'converted') throw conflict('El lead ya está convertido');
    if (lead.status === 'lost') throw conflict('Un lead perdido no puede convertirse');

    // Etapa: la indicada o la primera abierta del pipeline
    let stage;
    if (data.stage_id) {
      stage = await repo.getById(configs.stages, ctx.organizationId, data.stage_id, client);
      if (!stage) throw badRequest('stage_id no existe en esta organización');
    } else {
      const first = await client.query(
        `SELECT id, probability_default FROM crm_pipeline_stages
         WHERE organization_id = $1 AND deleted_at IS NULL AND NOT is_won AND NOT is_lost
         ORDER BY position ASC LIMIT 1`,
        [ctx.organizationId]
      );
      if (!first.rows.length) throw badRequest('No hay etapas abiertas en el pipeline');
      stage = first.rows[0];
    }
    const stageId = stage.id;

    const opp = await repo.insert(configs.opportunities, ctx.organizationId, ctx.user.id, {
      title: data.title || lead.title,
      company_id: lead.company_id,
      contact_id: lead.contact_id,
      lead_id: lead.id,
      stage_id: stageId,
      amount: data.amount !== undefined ? data.amount : lead.estimated_value,
      probability: stage.probability_default ?? null,
      priority: lead.priority,
      owner_user_id: lead.owner_user_id || ctx.user.id,
      main_pain: lead.main_pain,
      product_id: lead.product_id,
      source: lead.source,
      next_step: lead.next_step,
      next_follow_up_at: lead.next_follow_up_at,
    }, client);

    await client.query(
      `UPDATE crm_leads SET status = 'converted', converted_opportunity_id = $1, updated_by = $2
       WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL`,
      [opp.id, ctx.user.id, leadId, ctx.organizationId]
    );

    const audit = { ip: ctx.ip, userAgent: ctx.userAgent, organizationId: ctx.organizationId, actorUserId: ctx.user.id };
    await activityRepo.record(client, {
      ...audit, entityType: 'lead', entityId: leadId, action: 'convert',
      changes: { status: { from: lead.status, to: 'converted' }, opportunity_id: opp.id },
    });
    await activityRepo.record(client, {
      ...audit, entityType: 'opportunity', entityId: opp.id, action: 'create',
      changes: { converted_from_lead: leadId },
    });
    return opp;
  });
}

// ----------------------------------------------------------------
// Tags
// ----------------------------------------------------------------
async function listTags(organizationId, { entityType, entityId }) {
  if (entityType && entityId) {
    const result = await db.query(
      `SELECT t.id, t.name, t.color
       FROM crm_entity_tags et
       JOIN crm_tags t ON t.id = et.tag_id
       WHERE et.organization_id = $1 AND et.entity_type = $2 AND et.entity_id = $3
       ORDER BY t.name`,
      [organizationId, entityType, entityId]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT id, name, color FROM crm_tags WHERE organization_id = $1 ORDER BY name LIMIT 200`,
    [organizationId]
  );
  return result.rows;
}

async function createTag(req, { name, color }) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO crm_tags (organization_id, name, color, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, color`,
      [ctx.organizationId, name, color || null, ctx.user.id]
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'tag', entityId: result.rows[0].id, action: 'create',
      changes: { name }, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return result.rows[0];
  });
}

async function deleteTag(req, tagId) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM crm_tags WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [tagId, ctx.organizationId]
    );
    if (!result.rows.length) throw notFound();
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'tag', entityId: tagId, action: 'delete',
      ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { id: tagId };
  });
}

const ENTITY_TYPE_CONFIGS = {
  lead: configs.leads,
  company: configs.companies,
  contact: configs.contacts,
  opportunity: configs.opportunities,
};

async function assignTag(req, { tag_id, entity_type, entity_id }) {
  const ctx = makeContext(req);
  const cfg = ENTITY_TYPE_CONFIGS[entity_type];
  const [tag, entity] = await Promise.all([
    db.query(`SELECT id FROM crm_tags WHERE id = $1 AND organization_id = $2`, [tag_id, ctx.organizationId]),
    repo.getById(cfg, ctx.organizationId, entity_id),
  ]);
  if (!tag.rows.length) throw badRequest('tag_id no existe en esta organización');
  if (!entity) throw badRequest('La entidad no existe en esta organización');
  return db.withTransaction(async (client) => {
    await client.query(
      `INSERT INTO crm_entity_tags (organization_id, tag_id, entity_type, entity_id, created_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [ctx.organizationId, tag_id, entity_type, entity_id, ctx.user.id]
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: entity_type, entityId: entity_id, action: 'tag',
      changes: { tag_id }, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { ok: true };
  });
}

async function unassignTag(req, { tag_id, entity_type, entity_id }) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM crm_entity_tags
       WHERE organization_id = $1 AND tag_id = $2 AND entity_type = $3 AND entity_id = $4
       RETURNING tag_id`,
      [ctx.organizationId, tag_id, entity_type, entity_id]
    );
    if (!result.rows.length) throw notFound();
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: entity_type, entityId: entity_id, action: 'untag',
      changes: { tag_id }, ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return { ok: true };
  });
}

// ----------------------------------------------------------------
// RGPD: exportación y anonimización de un contacto
// ----------------------------------------------------------------
async function exportContact(req, contactId) {
  const ctx = makeContext(req);
  const contact = await repo.getById(configs.contacts, ctx.organizationId, contactId);
  if (!contact) throw notFound();
  const org = ctx.organizationId;
  const [company, leads, opps, tasks, notes, activities] = await Promise.all([
    contact.company_id
      ? repo.getById(configs.companies, org, contact.company_id)
      : Promise.resolve(null),
    db.query(`SELECT id, title, status, created_at FROM crm_leads
              WHERE organization_id = $1 AND contact_id = $2 AND deleted_at IS NULL`, [org, contactId]),
    db.query(`SELECT id, title, status, amount, created_at FROM crm_opportunities
              WHERE organization_id = $1 AND contact_id = $2 AND deleted_at IS NULL`, [org, contactId]),
    db.query(`SELECT id, title, status, due_at, created_at FROM crm_tasks
              WHERE organization_id = $1 AND entity_type = 'contact' AND entity_id = $2 AND deleted_at IS NULL`, [org, contactId]),
    db.query(`SELECT id, body, created_at FROM crm_notes
              WHERE organization_id = $1 AND entity_type = 'contact' AND entity_id = $2 AND deleted_at IS NULL`, [org, contactId]),
    db.query(`SELECT action, changes, created_at FROM crm_activity_log
              WHERE organization_id = $1 AND entity_type = 'contact' AND entity_id = $2
              ORDER BY created_at`, [org, contactId]),
  ]);
  // La exportación queda registrada (trazabilidad RGPD)
  await db.withTransaction((client) => activityRepo.record(client, {
    organizationId: org, actorUserId: ctx.user.id,
    entityType: 'contact', entityId: contactId, action: 'export',
    ip: ctx.ip, userAgent: ctx.userAgent,
  }));
  return {
    exported_at: new Date().toISOString(),
    contact,
    company: company ? { id: company.id, name: company.name } : null,
    leads: leads.rows,
    opportunities: opps.rows,
    tasks: tasks.rows,
    notes: notes.rows,
    activity: activities.rows,
  };
}

async function anonymizeContact(req, contactId) {
  const ctx = makeContext(req);
  return db.withTransaction(async (client) => {
    const contact = await repo.getById(configs.contacts, ctx.organizationId, contactId, client);
    if (!contact) throw notFound();
    if (contact.anonymized_at) throw conflict('El contacto ya está anonimizado');
    const result = await client.query(
      `UPDATE crm_contacts
       SET first_name = 'Anonimizado', last_name = NULL, email = NULL, phone = NULL,
           job_title = NULL, consent_status = 'not_requested', consent_source = NULL,
           consent_at = NULL, anonymized_at = now(), updated_by = $1
       WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
       RETURNING ${configs.contacts.selectColumns}`,
      [ctx.user.id, contactId, ctx.organizationId]
    );
    // Las notas sobre el contacto pueden contener datos personales:
    // se retiran (soft delete) junto con la anonimización.
    await client.query(
      `UPDATE crm_notes SET deleted_at = now(), updated_by = $1
       WHERE organization_id = $2 AND entity_type = 'contact' AND entity_id = $3 AND deleted_at IS NULL`,
      [ctx.user.id, ctx.organizationId, contactId]
    );
    await activityRepo.record(client, {
      organizationId: ctx.organizationId, actorUserId: ctx.user.id,
      entityType: 'contact', entityId: contactId, action: 'anonymize',
      ip: ctx.ip, userAgent: ctx.userAgent,
    });
    return result.rows[0];
  });
}

module.exports = { convertLead, listTags, createTag, deleteTag, assignTag, unassignTag, exportContact, anonymizeContact };
