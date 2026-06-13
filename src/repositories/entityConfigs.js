'use strict';

// Configuración declarativa por entidad: única fuente de nombres de
// columna que llegan al SQL. Nada de esto proviene del usuario.
// - columns: campos escribibles (insert/update)
// - filterable: filtros permitidos en listados
// - sortable: mapeo de claves de orden -> columna real
// - scopeField: campo usado para limitar a roles 'worker' (asignación)

const AUDIT_COLS = 'created_by, updated_by, created_at, updated_at';

const companies = {
  entityType: 'company',
  table: 'crm_companies',
  selectColumns: `id, name, legal_name, tax_id, industry, website, email, phone,
    address, city, province, postal_code, country, employee_count, owner_user_id,
    status, legal_basis, data_retention_until, ${AUDIT_COLS}`,
  columns: ['name', 'legal_name', 'tax_id', 'industry', 'website', 'email', 'phone',
    'address', 'city', 'province', 'postal_code', 'country', 'employee_count',
    'owner_user_id', 'status', 'legal_basis', 'data_retention_until'],
  filterable: {
    status: { column: 'status' },
    owner_user_id: { column: 'owner_user_id' },
  },
  searchable: ['name', 'legal_name', 'email', 'tax_id'],
  sortable: { name: 'name', created_at: 'created_at', updated_at: 'updated_at' },
  defaultSort: 'created_at',
  scopeField: 'owner_user_id',
};

const contacts = {
  entityType: 'contact',
  table: 'crm_contacts',
  selectColumns: `id, company_id, first_name, last_name, email, phone, job_title,
    is_primary, owner_user_id, legal_basis, consent_status, consent_source,
    consent_at, data_retention_until, anonymized_at, ${AUDIT_COLS}`,
  columns: ['company_id', 'first_name', 'last_name', 'email', 'phone', 'job_title',
    'is_primary', 'owner_user_id', 'legal_basis', 'consent_status', 'consent_source',
    'consent_at', 'data_retention_until'],
  filterable: {
    company_id: { column: 'company_id' },
    owner_user_id: { column: 'owner_user_id' },
  },
  searchable: ['first_name', 'last_name', 'email'],
  sortable: { first_name: 'first_name', created_at: 'created_at', updated_at: 'updated_at' },
  defaultSort: 'created_at',
  scopeField: 'owner_user_id',
};

const leads = {
  entityType: 'lead',
  table: 'crm_leads',
  selectColumns: `id, title, company_id, contact_id, status, source, priority,
    owner_user_id, main_pain, zyra_product, estimated_value, next_step,
    next_follow_up_at, lost_reason, converted_opportunity_id, ${AUDIT_COLS}`,
  columns: ['title', 'company_id', 'contact_id', 'status', 'source', 'priority',
    'owner_user_id', 'main_pain', 'zyra_product', 'estimated_value', 'next_step',
    'next_follow_up_at', 'lost_reason'],
  filterable: {
    status: { column: 'status' },
    priority: { column: 'priority' },
    source: { column: 'source' },
    owner_user_id: { column: 'owner_user_id' },
    zyra_product: { column: 'zyra_product' },
    company_id: { column: 'company_id' },
    follow_up_before: { column: 'next_follow_up_at', op: 'lte' },
  },
  searchable: ['title', 'main_pain', 'next_step'],
  sortable: {
    title: 'title', priority: 'priority', status: 'status',
    next_follow_up_at: 'next_follow_up_at', estimated_value: 'estimated_value',
    created_at: 'created_at', updated_at: 'updated_at',
  },
  defaultSort: 'created_at',
  scopeField: 'owner_user_id',
};

const opportunities = {
  entityType: 'opportunity',
  table: 'crm_opportunities',
  selectColumns: `id, title, company_id, contact_id, lead_id, stage_id, status,
    amount, currency, probability, expected_close_date, closed_at, lost_reason,
    priority, owner_user_id, main_pain, zyra_product, source, next_step,
    next_follow_up_at, ${AUDIT_COLS}`,
  columns: ['title', 'company_id', 'contact_id', 'lead_id', 'stage_id', 'amount',
    'currency', 'probability', 'expected_close_date', 'priority', 'owner_user_id',
    'main_pain', 'zyra_product', 'source', 'next_step', 'next_follow_up_at'],
  filterable: {
    status: { column: 'status' },
    stage_id: { column: 'stage_id' },
    priority: { column: 'priority' },
    owner_user_id: { column: 'owner_user_id' },
    zyra_product: { column: 'zyra_product' },
    company_id: { column: 'company_id' },
  },
  searchable: ['title', 'main_pain', 'next_step'],
  sortable: {
    title: 'title', amount: 'amount', probability: 'probability',
    expected_close_date: 'expected_close_date', created_at: 'created_at', updated_at: 'updated_at',
  },
  defaultSort: 'created_at',
  scopeField: 'owner_user_id',
};

const stages = {
  entityType: 'pipeline_stage',
  table: 'crm_pipeline_stages',
  selectColumns: `id, name, position, probability_default, is_won, is_lost, color, ${AUDIT_COLS}`,
  columns: ['name', 'position', 'probability_default', 'is_won', 'is_lost', 'color'],
  filterable: {},
  searchable: [],
  sortable: { position: 'position', name: 'name' },
  defaultSort: 'position',
  scopeField: null,
};

const tasks = {
  entityType: 'task',
  table: 'crm_tasks',
  selectColumns: `id, title, description, entity_type, entity_id, assigned_to,
    due_at, status, priority, completed_at, ${AUDIT_COLS}`,
  columns: ['title', 'description', 'entity_type', 'entity_id', 'assigned_to',
    'due_at', 'status', 'priority', 'completed_at'],
  filterable: {
    status: { column: 'status' },
    assigned_to: { column: 'assigned_to' },
    priority: { column: 'priority' },
    entity_type: { column: 'entity_type' },
    entity_id: { column: 'entity_id' },
    due_before: { column: 'due_at', op: 'lte' },
  },
  searchable: ['title', 'description'],
  sortable: { due_at: 'due_at', priority: 'priority', created_at: 'created_at', updated_at: 'updated_at' },
  defaultSort: 'created_at',
  scopeField: 'assigned_to',
};

const notes = {
  entityType: 'note',
  table: 'crm_notes',
  selectColumns: `id, entity_type, entity_id, body, ${AUDIT_COLS}`,
  columns: ['entity_type', 'entity_id', 'body'],
  filterable: {
    entity_type: { column: 'entity_type' },
    entity_id: { column: 'entity_id' },
  },
  searchable: [],
  sortable: { created_at: 'created_at' },
  defaultSort: 'created_at',
  scopeField: 'created_by',
};

module.exports = { companies, contacts, leads, opportunities, stages, tasks, notes };
