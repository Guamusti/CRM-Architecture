'use strict';
const services = require('../services/crmServices');
const extra = require('../services/crmExtraServices');
const items = require('../services/opportunityItemsService');
const db = require('../config/db');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

async function closeOpportunity(req, res, next) {
  try {
    const row = await services.closeOpportunity(req, req.params.id, req.body);
    res.json({ data: row });
  } catch (err) { next(err); }
}

async function getPipeline(req, res, next) {
  try {
    res.json({ data: await services.getPipeline(req) });
  } catch (err) { next(err); }
}

async function getDashboard(req, res, next) {
  try {
    res.json({ data: await services.getDashboard(req) });
  } catch (err) { next(err); }
}

async function listActivities(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const { rows, total } = await services.listActivities(req.user.organizationId, {
      entityType: req.query.entity_type,
      entityId: req.query.entity_id,
      pageSize: pagination.pageSize,
      offset: pagination.offset,
    });
    res.json(paginatedResponse(rows, total, pagination));
  } catch (err) { next(err); }
}

// Usuarios del tenant (solo id/name/role: para selects de asignación)
async function listUsers(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, name, role FROM users
       WHERE organization_id = $1 AND deleted_at IS NULL AND is_active
       ORDER BY name LIMIT 200`,
      [req.user.organizationId]
    );
    res.json({ data: result.rows });
  } catch (err) { next(err); }
}

async function convertLead(req, res, next) {
  try {
    const opp = await extra.convertLead(req, req.params.id, req.body);
    res.status(201).json({ data: opp });
  } catch (err) { next(err); }
}

async function listTags(req, res, next) {
  try {
    const rows = await extra.listTags(req.user.organizationId, {
      entityType: req.query.entity_type,
      entityId: req.query.entity_id,
    });
    res.json({ data: rows });
  } catch (err) { next(err); }
}

async function createTag(req, res, next) {
  try {
    res.status(201).json({ data: await extra.createTag(req, req.body) });
  } catch (err) { next(err); }
}

async function deleteTag(req, res, next) {
  try {
    await extra.deleteTag(req, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function assignTag(req, res, next) {
  try {
    res.status(201).json({ data: await extra.assignTag(req, req.body) });
  } catch (err) { next(err); }
}

async function unassignTag(req, res, next) {
  try {
    await extra.unassignTag(req, req.body);
    res.status(204).send();
  } catch (err) { next(err); }
}

async function exportContact(req, res, next) {
  try {
    res.json({ data: await extra.exportContact(req, req.params.id) });
  } catch (err) { next(err); }
}

async function anonymizeContact(req, res, next) {
  try {
    res.json({ data: await extra.anonymizeContact(req, req.params.id) });
  } catch (err) { next(err); }
}

// --- Líneas de producto de oportunidades ---
async function listItems(req, res, next) {
  try {
    res.json({ data: await items.listItems(req, req.params.id) });
  } catch (err) { next(err); }
}

async function addItem(req, res, next) {
  try {
    res.status(201).json({ data: await items.addItem(req, req.params.id, req.body) });
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    res.json({ data: await items.updateItem(req, req.params.id, req.params.itemId, req.body) });
  } catch (err) { next(err); }
}

async function removeItem(req, res, next) {
  try {
    res.json({ data: await items.removeItem(req, req.params.id, req.params.itemId) });
  } catch (err) { next(err); }
}

async function getForecast(req, res, next) {
  try {
    res.json({ data: await items.getForecast(req, req.query) });
  } catch (err) { next(err); }
}

module.exports = {
  closeOpportunity, getPipeline, getDashboard, listActivities, listUsers,
  convertLead, listTags, createTag, deleteTag, assignTag, unassignTag,
  exportContact, anonymizeContact,
  listItems, addItem, updateItem, removeItem, getForecast,
};
