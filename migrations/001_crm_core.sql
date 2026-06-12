-- ============================================================
-- Migración 001: núcleo del CRM Zyra
-- Multi-tenant por organization_id. Soft delete. Auditoría append-only.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Trigger genérico de updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Tenants y usuarios (mínimo viable standalone; al integrar con
-- Zyra se mapean a sus tablas de stores/users existentes)
-- ------------------------------------------------------------
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(200) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  email           varchar(254) NOT NULL,
  password_hash   varchar(100) NOT NULL,
  name            varchar(120) NOT NULL,
  role            varchar(20) NOT NULL CHECK (role IN ('owner','admin','manager','worker','caja')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (organization_id, email)
);
CREATE INDEX idx_users_org ON users(organization_id);

-- ------------------------------------------------------------
-- Pipeline configurable
-- ------------------------------------------------------------
CREATE TABLE crm_pipeline_stages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  name                varchar(80) NOT NULL,
  position            int NOT NULL DEFAULT 0,
  probability_default int NOT NULL DEFAULT 0 CHECK (probability_default BETWEEN 0 AND 100),
  is_won              boolean NOT NULL DEFAULT false,
  is_lost             boolean NOT NULL DEFAULT false,
  color               varchar(20),
  created_by          uuid REFERENCES users(id),
  updated_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CHECK (NOT (is_won AND is_lost))
);
CREATE UNIQUE INDEX uq_stage_org_name ON crm_pipeline_stages(organization_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_stages_org ON crm_pipeline_stages(organization_id, position) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Empresas (cuentas)
-- ------------------------------------------------------------
CREATE TABLE crm_companies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id),
  name                 varchar(200) NOT NULL,
  legal_name           varchar(200),
  tax_id               varchar(20),
  industry             varchar(100),
  website              varchar(255),
  email                varchar(254),
  phone                varchar(30),
  address              varchar(255),
  city                 varchar(100),
  province             varchar(100),
  postal_code          varchar(10),
  country              char(2) NOT NULL DEFAULT 'ES',
  employee_count       int CHECK (employee_count >= 0),
  owner_user_id        uuid REFERENCES users(id),
  status               varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','prospect','customer','former_customer')),
  -- RGPD
  legal_basis          varchar(30) NOT NULL DEFAULT 'legitimate_interest'
                       CHECK (legal_basis IN ('legitimate_interest','contract','consent','legal_obligation')),
  data_retention_until date,
  created_by           uuid REFERENCES users(id),
  updated_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX idx_companies_org ON crm_companies(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_owner ON crm_companies(organization_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_name ON crm_companies(organization_id, lower(name)) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Contactos (personas físicas -> datos personales RGPD)
-- ------------------------------------------------------------
CREATE TABLE crm_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id),
  company_id           uuid REFERENCES crm_companies(id),
  first_name           varchar(100) NOT NULL,
  last_name            varchar(150),
  email                varchar(254),
  phone                varchar(30),
  job_title            varchar(120),
  is_primary           boolean NOT NULL DEFAULT false,
  owner_user_id        uuid REFERENCES users(id),
  -- RGPD
  legal_basis          varchar(30) NOT NULL DEFAULT 'legitimate_interest'
                       CHECK (legal_basis IN ('legitimate_interest','contract','consent','legal_obligation')),
  consent_status       varchar(20) NOT NULL DEFAULT 'not_requested'
                       CHECK (consent_status IN ('not_requested','requested','granted','revoked')),
  consent_source       varchar(120),
  consent_at           timestamptz,
  data_retention_until date,
  anonymized_at        timestamptz,
  created_by           uuid REFERENCES users(id),
  updated_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX idx_contacts_org ON crm_contacts(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_company ON crm_contacts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_email ON crm_contacts(organization_id, lower(email)) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
CREATE TABLE crm_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id),
  title              varchar(200) NOT NULL,
  company_id         uuid REFERENCES crm_companies(id),
  contact_id         uuid REFERENCES crm_contacts(id),
  status             varchar(20) NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','contacted','qualified','unqualified','converted','lost')),
  source             varchar(30) NOT NULL DEFAULT 'other'
                     CHECK (source IN ('web','referral','cold_call','email','social','event','partner','inbound','other')),
  priority           varchar(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  owner_user_id      uuid REFERENCES users(id),
  main_pain          varchar(500),
  zyra_product       varchar(50)
                     CHECK (zyra_product IS NULL OR zyra_product IN ('tpv','erp','inventario','fichajes','tareas','crm','suite')),
  estimated_value    numeric(12,2) CHECK (estimated_value >= 0),
  next_step          varchar(500),
  next_follow_up_at  timestamptz,
  lost_reason        varchar(500),
  converted_opportunity_id uuid,
  created_by         uuid REFERENCES users(id),
  updated_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX idx_leads_org_status ON crm_leads(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_owner ON crm_leads(organization_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_follow_up ON crm_leads(organization_id, next_follow_up_at) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Oportunidades
-- ------------------------------------------------------------
CREATE TABLE crm_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id),
  title               varchar(200) NOT NULL,
  company_id          uuid REFERENCES crm_companies(id),
  contact_id          uuid REFERENCES crm_contacts(id),
  lead_id             uuid REFERENCES crm_leads(id),
  stage_id            uuid NOT NULL REFERENCES crm_pipeline_stages(id),
  status              varchar(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  amount              numeric(12,2) CHECK (amount >= 0),
  currency            char(3) NOT NULL DEFAULT 'EUR',
  probability         int CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  closed_at           timestamptz,
  lost_reason         varchar(500),
  priority            varchar(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  owner_user_id       uuid REFERENCES users(id),
  main_pain           varchar(500),
  zyra_product        varchar(50)
                      CHECK (zyra_product IS NULL OR zyra_product IN ('tpv','erp','inventario','fichajes','tareas','crm','suite')),
  source              varchar(30),
  next_step           varchar(500),
  next_follow_up_at   timestamptz,
  created_by          uuid REFERENCES users(id),
  updated_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX idx_opps_org_stage ON crm_opportunities(organization_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_org_status ON crm_opportunities(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_owner ON crm_opportunities(organization_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_follow_up ON crm_opportunities(organization_id, next_follow_up_at) WHERE deleted_at IS NULL;

ALTER TABLE crm_leads
  ADD CONSTRAINT fk_leads_converted_opp FOREIGN KEY (converted_opportunity_id) REFERENCES crm_opportunities(id);

-- ------------------------------------------------------------
-- Tareas comerciales (polimórficas sobre entidades CRM)
-- ------------------------------------------------------------
CREATE TABLE crm_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title           varchar(200) NOT NULL,
  description     varchar(2000),
  entity_type     varchar(20) CHECK (entity_type IN ('lead','company','contact','opportunity')),
  entity_id       uuid,
  assigned_to     uuid REFERENCES users(id),
  due_at          timestamptz,
  status          varchar(15) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  priority        varchar(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  completed_at    timestamptz,
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CHECK ((entity_type IS NULL) = (entity_id IS NULL))
);
CREATE INDEX idx_tasks_org_status ON crm_tasks(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assignee ON crm_tasks(organization_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due ON crm_tasks(organization_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_entity ON crm_tasks(organization_id, entity_type, entity_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Notas internas (separadas de datos personales)
-- ------------------------------------------------------------
CREATE TABLE crm_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  entity_type     varchar(20) NOT NULL CHECK (entity_type IN ('lead','company','contact','opportunity')),
  entity_id       uuid NOT NULL,
  body            varchar(5000) NOT NULL,
  created_by      uuid NOT NULL REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_notes_entity ON crm_notes(organization_id, entity_type, entity_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Etiquetas
-- ------------------------------------------------------------
CREATE TABLE crm_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name            varchar(50) NOT NULL,
  color           varchar(20),
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_tags_org_name ON crm_tags(organization_id, lower(name));

CREATE TABLE crm_entity_tags (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tag_id          uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  entity_type     varchar(20) NOT NULL CHECK (entity_type IN ('lead','company','contact','opportunity')),
  entity_id       uuid NOT NULL,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_entity_tags_entity ON crm_entity_tags(organization_id, entity_type, entity_id);

-- ------------------------------------------------------------
-- Activity log (negocio) - append-only
-- ------------------------------------------------------------
CREATE TABLE crm_activity_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id   uuid REFERENCES users(id),
  entity_type     varchar(30) NOT NULL,
  entity_id       uuid,
  action          varchar(40) NOT NULL,
  changes         jsonb,
  ip_address      inet,
  user_agent      varchar(300),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_org_created ON crm_activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_entity ON crm_activity_log(organization_id, entity_type, entity_id);

CREATE OR REPLACE FUNCTION crm_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'crm_activity_log es append-only: % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_log_immutable
  BEFORE UPDATE OR DELETE ON crm_activity_log
  FOR EACH ROW EXECUTE FUNCTION crm_block_mutation();

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','users','crm_pipeline_stages','crm_companies',
                           'crm_contacts','crm_leads','crm_opportunities','crm_tasks','crm_notes']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;
