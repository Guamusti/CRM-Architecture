'use strict';
const { z } = require('zod');

// Tipos base reutilizables. Todos los strings se recortan (trim) y
// tienen longitud máxima. Los esquemas de entidad usan .strict()
// para rechazar cualquier campo no declarado (anti mass-assignment).

const uuid = z.string().uuid();

const shortText = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).nullish();

const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().max(30).regex(/^[+\d][\d\s().-]{2,}$/, 'Teléfono inválido');
const money = z.coerce.number().min(0).max(999999999);
const isoDate = z.string().date();
const isoDateTime = z.string().datetime({ offset: true });

const priority = z.enum(['low', 'medium', 'high', 'urgent']);
const leadSource = z.enum(['web', 'referral', 'cold_call', 'email', 'social', 'event', 'partner', 'inbound', 'other']);

// Valores de campos personalizados: el tipo concreto se valida en el
// servicio contra las definiciones del tenant. Aquí: forma y límites.
const customValues = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Clave de campo personalizado inválida'),
  z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
).refine((obj) => Object.keys(obj).length <= 30, { message: 'Máximo 30 campos personalizados' });
const entityType = z.enum(['lead', 'company', 'contact', 'opportunity']);
const legalBasis = z.enum(['legitimate_interest', 'contract', 'consent', 'legal_obligation']);

const idParams = z.object({ id: uuid }).strict();

// Query base de listados: paginación + búsqueda + orden.
// El campo de orden se valida contra whitelist en el repositorio.
const listQueryBase = {
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
};

module.exports = {
  z, uuid, shortText, optionalText, email, phone, money, isoDate, isoDateTime,
  priority, leadSource, entityType, legalBasis, idParams, listQueryBase, customValues,
};
