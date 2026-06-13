'use strict';
const services = require('../services/crmServices');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// Controladores thin: orquestan servicio + respuesta HTTP.
// La validación ya ocurrió en middleware; el tenant sale del JWT.

function crudController(service) {
  return {
    async list(req, res, next) {
      try {
        const pagination = parsePagination(req.query);
        const { rows, total } = await service.list(req, pagination);
        res.json(paginatedResponse(rows, total, pagination));
      } catch (err) { next(err); }
    },
    async getById(req, res, next) {
      try {
        res.json({ data: await service.getById(req, req.params.id) });
      } catch (err) { next(err); }
    },
    async create(req, res, next) {
      try {
        await services.validatePayload(req.user.organizationId, service.config.entityType, req.body);
        const row = await service.create(req, req.body);
        res.status(201).json({ data: row });
      } catch (err) { next(err); }
    },
    async update(req, res, next) {
      try {
        await services.validatePayload(req.user.organizationId, service.config.entityType, req.body);
        const row = await service.update(req, req.params.id, req.body);
        res.json({ data: row });
      } catch (err) { next(err); }
    },
    async remove(req, res, next) {
      try {
        await service.remove(req, req.params.id);
        res.status(204).send();
      } catch (err) { next(err); }
    },
  };
}

module.exports = { crudController };
