'use strict';
const express = require('express');
const { requireAuth } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/permissions');
const { validateBody, validateQuery, validateParams } = require('../../middlewares/validate');
const { writeLimiter } = require('../../middlewares/rateLimit');
const { idParams } = require('../../validators/common');
const schemas = require('../../validators/crm.schemas');
const services = require('../../services/crmServices');
const { crudController } = require('../../controllers/crudController');
const crm = require('../../controllers/crmController');

const router = express.Router();

// Toda ruta CRM exige autenticación. Cada operación exige además
// el permiso correspondiente (matriz por rol, server-side).
router.use(requireAuth);

// Registra un recurso CRUD estándar con sus esquemas.
function mountCrud(path, service, { create, update, listQuery, deletePermission = 'crm:delete' }) {
  const ctrl = crudController(service);
  router.get(`/${path}`, requirePermission('crm:read'), validateQuery(listQuery), ctrl.list);
  router.get(`/${path}/:id`, requirePermission('crm:read'), validateParams(idParams), ctrl.getById);
  router.post(`/${path}`, writeLimiter, requirePermission('crm:create'), validateBody(create), ctrl.create);
  router.patch(`/${path}/:id`, writeLimiter, requirePermission('crm:update'), validateParams(idParams), validateBody(update), ctrl.update);
  router.delete(`/${path}/:id`, writeLimiter, requirePermission(deletePermission), validateParams(idParams), ctrl.remove);
}

mountCrud('companies', services.companies, {
  create: schemas.companyCreate, update: schemas.companyUpdate, listQuery: schemas.companyListQuery,
});
mountCrud('contacts', services.contacts, {
  create: schemas.contactCreate, update: schemas.contactUpdate, listQuery: schemas.contactListQuery,
});
mountCrud('leads', services.leads, {
  create: schemas.leadCreate, update: schemas.leadUpdate, listQuery: schemas.leadListQuery,
});
mountCrud('opportunities', services.opportunities, {
  create: schemas.opportunityCreate, update: schemas.opportunityUpdate, listQuery: schemas.opportunityListQuery,
});
mountCrud('tasks', services.tasks, {
  create: schemas.taskCreate, update: schemas.taskUpdate, listQuery: schemas.taskListQuery,
  // las tareas las puede borrar quien las gestiona
  deletePermission: 'crm:update',
});

// Cierre de oportunidades: flujo dedicado, permiso específico.
router.post(
  '/opportunities/:id/close',
  writeLimiter,
  requirePermission('crm:close'),
  validateParams(idParams),
  validateBody(schemas.opportunityClose),
  crm.closeOpportunity
);

// Pipeline (kanban) y gestión de etapas.
router.get('/pipeline', requirePermission('crm:read'), crm.getPipeline);
{
  const ctrl = crudController(services.stages);
  router.post('/pipeline/stages', writeLimiter, requirePermission('crm:pipeline:manage'), validateBody(schemas.stageCreate), ctrl.create);
  router.patch('/pipeline/stages/:id', writeLimiter, requirePermission('crm:pipeline:manage'), validateParams(idParams), validateBody(schemas.stageUpdate), ctrl.update);
  router.delete('/pipeline/stages/:id', writeLimiter, requirePermission('crm:pipeline:manage'), validateParams(idParams), ctrl.remove);
}

// Notas internas (crear y listar por entidad).
{
  const ctrl = crudController(services.notes);
  router.post('/notes', writeLimiter, requirePermission('crm:create'), validateBody(schemas.noteCreate), ctrl.create);
  router.get('/notes', requirePermission('crm:read'), validateQuery(schemas.activityListQuery), ctrl.list);
  router.delete('/notes/:id', writeLimiter, requirePermission('crm:update'), validateParams(idParams), ctrl.remove);
}

// Conversión lead -> oportunidad: decisión comercial relevante,
// reservada a quien puede cerrar oportunidades (owner/admin/manager).
router.post(
  '/leads/:id/convert',
  writeLimiter,
  requirePermission('crm:close'),
  validateParams(idParams),
  validateBody(schemas.leadConvert),
  crm.convertLead
);

// Etiquetas
router.get('/tags', requirePermission('crm:read'), validateQuery(schemas.tagListQuery), crm.listTags);
router.post('/tags', writeLimiter, requirePermission('crm:update'), validateBody(schemas.tagCreate), crm.createTag);
router.delete('/tags/:id', writeLimiter, requirePermission('crm:delete'), validateParams(idParams), crm.deleteTag);
router.post('/tags/assign', writeLimiter, requirePermission('crm:update'), validateBody(schemas.tagAssign), crm.assignTag);
router.post('/tags/unassign', writeLimiter, requirePermission('crm:update'), validateBody(schemas.tagAssign), crm.unassignTag);

// RGPD: exportación (owner/admin/manager) y anonimización (owner/admin)
router.get('/contacts/:id/export', requirePermission('crm:export'), validateParams(idParams), crm.exportContact);
router.post('/contacts/:id/anonymize', writeLimiter, requirePermission('crm:gdpr:manage'), validateParams(idParams), crm.anonymizeContact);

// Historial de actividad y dashboard.
router.get('/activities', requirePermission('crm:read'), validateQuery(schemas.activityListQuery), crm.listActivities);
router.get('/dashboard', requirePermission('crm:read'), crm.getDashboard);

// Usuarios del tenant para selects de asignación (datos mínimos).
router.get('/users', requirePermission('crm:read'), crm.listUsers);

module.exports = router;
