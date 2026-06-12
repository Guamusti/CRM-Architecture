'use strict';
const {
  z, uuid, shortText, optionalText, email, phone, money, isoDate, isoDateTime,
  priority, zyraProduct, leadSource, entityType, legalBasis, listQueryBase,
} = require('./common');

// ----------------------------------------------------------------
// Empresas
// ----------------------------------------------------------------
const companyCreate = z.object({
  name: shortText(200),
  legal_name: optionalText(200),
  tax_id: optionalText(20),
  industry: optionalText(100),
  website: z.string().trim().url().max(255).nullish(),
  email: email.nullish(),
  phone: phone.nullish(),
  address: optionalText(255),
  city: optionalText(100),
  province: optionalText(100),
  postal_code: optionalText(10),
  country: z.string().trim().length(2).toUpperCase().optional(),
  employee_count: z.coerce.number().int().min(0).max(1000000).nullish(),
  owner_user_id: uuid.nullish(),
  status: z.enum(['active', 'inactive', 'prospect', 'customer', 'former_customer']).optional(),
  legal_basis: legalBasis.optional(),
  data_retention_until: isoDate.nullish(),
}).strict();

const companyUpdate = companyCreate.partial();

const companyListQuery = z.object({
  ...listQueryBase,
  status: z.enum(['active', 'inactive', 'prospect', 'customer', 'former_customer']).optional(),
  owner_user_id: uuid.optional(),
}).strict();

// ----------------------------------------------------------------
// Contactos
// ----------------------------------------------------------------
const contactCreate = z.object({
  first_name: shortText(100),
  last_name: optionalText(150),
  email: email.nullish(),
  phone: phone.nullish(),
  job_title: optionalText(120),
  company_id: uuid.nullish(),
  is_primary: z.boolean().optional(),
  owner_user_id: uuid.nullish(),
  legal_basis: legalBasis.optional(),
  consent_status: z.enum(['not_requested', 'requested', 'granted', 'revoked']).optional(),
  consent_source: optionalText(120),
  consent_at: isoDateTime.nullish(),
  data_retention_until: isoDate.nullish(),
}).strict();

const contactUpdate = contactCreate.partial();

const contactListQuery = z.object({
  ...listQueryBase,
  company_id: uuid.optional(),
  owner_user_id: uuid.optional(),
}).strict();

// ----------------------------------------------------------------
// Leads
// ----------------------------------------------------------------
const leadStatus = z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost']);

const leadCreate = z.object({
  title: shortText(200),
  company_id: uuid.nullish(),
  contact_id: uuid.nullish(),
  status: leadStatus.optional(),
  source: leadSource.optional(),
  priority: priority.optional(),
  owner_user_id: uuid.nullish(),
  main_pain: optionalText(500),
  zyra_product: zyraProduct.nullish(),
  estimated_value: money.nullish(),
  next_step: optionalText(500),
  next_follow_up_at: isoDateTime.nullish(),
  lost_reason: optionalText(500),
}).strict();

const leadUpdate = leadCreate.partial();

const leadListQuery = z.object({
  ...listQueryBase,
  status: leadStatus.optional(),
  priority: priority.optional(),
  source: leadSource.optional(),
  owner_user_id: uuid.optional(),
  zyra_product: zyraProduct.optional(),
  company_id: uuid.optional(),
  follow_up_before: isoDateTime.optional(),
}).strict();

// ----------------------------------------------------------------
// Oportunidades
// ----------------------------------------------------------------
const opportunityCreate = z.object({
  title: shortText(200),
  company_id: uuid.nullish(),
  contact_id: uuid.nullish(),
  lead_id: uuid.nullish(),
  stage_id: uuid,
  amount: money.nullish(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  probability: z.coerce.number().int().min(0).max(100).nullish(),
  expected_close_date: isoDate.nullish(),
  priority: priority.optional(),
  owner_user_id: uuid.nullish(),
  main_pain: optionalText(500),
  zyra_product: zyraProduct.nullish(),
  source: optionalText(30),
  next_step: optionalText(500),
  next_follow_up_at: isoDateTime.nullish(),
}).strict();

// status/closed_at/lost_reason se gestionan vía el flujo de cierre,
// no por PATCH libre.
const opportunityUpdate = opportunityCreate.partial();

const opportunityClose = z.object({
  status: z.enum(['won', 'lost']),
  lost_reason: optionalText(500),
}).strict();

const opportunityListQuery = z.object({
  ...listQueryBase,
  status: z.enum(['open', 'won', 'lost']).optional(),
  stage_id: uuid.optional(),
  priority: priority.optional(),
  owner_user_id: uuid.optional(),
  zyra_product: zyraProduct.optional(),
  company_id: uuid.optional(),
}).strict();

// ----------------------------------------------------------------
// Pipeline stages
// ----------------------------------------------------------------
const stageCreate = z.object({
  name: shortText(80),
  position: z.coerce.number().int().min(0).max(1000).optional(),
  probability_default: z.coerce.number().int().min(0).max(100).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
  color: optionalText(20),
}).strict();

const stageUpdate = stageCreate.partial();

// ----------------------------------------------------------------
// Tareas
// ----------------------------------------------------------------
const taskCreate = z.object({
  title: shortText(200),
  description: optionalText(2000),
  entity_type: entityType.nullish(),
  entity_id: uuid.nullish(),
  assigned_to: uuid.nullish(),
  due_at: isoDateTime.nullish(),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
  priority: priority.optional(),
}).strict().refine(
  (d) => (d.entity_type == null) === (d.entity_id == null),
  { message: 'entity_type y entity_id deben ir juntos' }
);

const taskUpdate = z.object({
  title: shortText(200).optional(),
  description: optionalText(2000),
  assigned_to: uuid.nullish(),
  due_at: isoDateTime.nullish(),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
  priority: priority.optional(),
}).strict();

const taskListQuery = z.object({
  ...listQueryBase,
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
  assigned_to: uuid.optional(),
  priority: priority.optional(),
  entity_type: entityType.optional(),
  entity_id: uuid.optional(),
  due_before: isoDateTime.optional(),
}).strict();

// ----------------------------------------------------------------
// Notas y actividades
// ----------------------------------------------------------------
const noteCreate = z.object({
  entity_type: entityType,
  entity_id: uuid,
  body: shortText(5000),
}).strict();

const activityListQuery = z.object({
  ...listQueryBase,
  entity_type: z.string().trim().max(30).optional(),
  entity_id: uuid.optional(),
}).strict();

module.exports = {
  companyCreate, companyUpdate, companyListQuery,
  contactCreate, contactUpdate, contactListQuery,
  leadCreate, leadUpdate, leadListQuery,
  opportunityCreate, opportunityUpdate, opportunityClose, opportunityListQuery,
  stageCreate, stageUpdate,
  taskCreate, taskUpdate, taskListQuery,
  noteCreate, activityListQuery,
};
