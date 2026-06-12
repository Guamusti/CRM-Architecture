'use strict';
const services = require('../services/crmServices');
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

module.exports = { closeOpportunity, getPipeline, getDashboard, listActivities };
