'use strict';
const db = require('../config/db');

// Activity log append-only (protegido además por trigger en BD).

async function record(client, { organizationId, actorUserId, entityType, entityId, action, changes, ip, userAgent }) {
  await client.query(
    `INSERT INTO crm_activity_log
       (organization_id, actor_user_id, entity_type, entity_id, action, changes, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [organizationId, actorUserId, entityType, entityId, action,
     changes ? JSON.stringify(changes) : null, ip || null, (userAgent || '').slice(0, 300) || null]
  );
}

async function listActivities(organizationId, { entityType, entityId, pageSize, offset }) {
  const params = [organizationId];
  const where = ['a.organization_id = $1'];
  if (entityType) {
    params.push(entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(entityId);
    where.push(`a.entity_id = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const count = await db.query(
    `SELECT count(*)::int AS total FROM crm_activity_log a WHERE ${whereSql}`, params
  );
  params.push(pageSize, offset);
  const rows = await db.query(
    `SELECT a.id, a.entity_type, a.entity_id, a.action, a.changes, a.created_at,
            a.actor_user_id, u.name AS actor_name
     FROM crm_activity_log a
     LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows: rows.rows, total: count.rows[0].total };
}

module.exports = { record, listActivities };
