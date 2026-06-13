'use strict';
const adminService = require('../services/adminService');
const { validatePayload } = require('../services/crmServices');

async function listUsers(req, res, next) {
  try {
    res.json({ data: await adminService.listUsersFull(req.user.organizationId) });
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    res.status(201).json({ data: await adminService.createUser(req, req.body) });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    res.json({ data: await adminService.updateUser(req, req.params.id, req.body) });
  } catch (err) { next(err); }
}

async function getSettings(req, res, next) {
  try {
    res.json({ data: await adminService.getSettings(req.user.organizationId) });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    res.json({ data: await adminService.updateSettings(req, req.body) });
  } catch (err) { next(err); }
}

async function importRows(req, res, next) {
  try {
    const result = await adminService.importRows(req, req.params.resource, req.body.rows, validatePayload);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, updateUser, getSettings, updateSettings, importRows };
