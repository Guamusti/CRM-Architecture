-- ============================================================
-- Migración 003: productización white-label
-- El CRM pasa de módulo interno de Zyra a producto replicable:
-- catálogo de productos por tenant, campos personalizados,
-- branding por organización y email único global (signup abierto).
-- ============================================================
BEGIN;

-- ------------------------------------------------------------
-- Branding/ajustes por organización (white-label)
-- ------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';

-- Con alta self-service el email debe ser único globalmente
-- (el login resuelve la organización a partir del email).
CREATE UNIQUE INDEX uq_users_email_global ON users (lower(email)) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Catálogo de productos/servicios por tenant
-- (sustituye al enum fijo zyra_product)
-- ------------------------------------------------------------
CREATE TABLE crm_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name            varchar(120) NOT NULL,
  description     varchar(500),
  price           numeric(12,2) CHECK (price >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX uq_products_org_name ON crm_products(organization_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_org ON crm_products(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_crm_products_updated_at BEFORE UPDATE ON crm_products
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Migrar leads/oportunidades del enum fijo al catálogo.
-- Sin datos de producción: se sustituye la columna directamente.
ALTER TABLE crm_leads ADD COLUMN product_id uuid REFERENCES crm_products(id);
ALTER TABLE crm_opportunities ADD COLUMN product_id uuid REFERENCES crm_products(id);
ALTER TABLE crm_leads DROP COLUMN zyra_product;
ALTER TABLE crm_opportunities DROP COLUMN zyra_product;
CREATE INDEX idx_leads_product ON crm_leads(organization_id, product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_product ON crm_opportunities(organization_id, product_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Campos personalizados por tenant (definiciones + valores jsonb)
-- ------------------------------------------------------------
CREATE TABLE crm_custom_fields (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  entity_type     varchar(20) NOT NULL CHECK (entity_type IN ('lead','company','contact','opportunity')),
  key             varchar(40) NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label           varchar(80) NOT NULL,
  field_type      varchar(10) NOT NULL CHECK (field_type IN ('text','number','date','boolean','select')),
  options         jsonb,            -- array de strings para field_type = select
  is_required     boolean NOT NULL DEFAULT false,
  position        int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX uq_custom_fields_key ON crm_custom_fields(organization_id, entity_type, key) WHERE deleted_at IS NULL;
CREATE INDEX idx_custom_fields_org ON crm_custom_fields(organization_id, entity_type) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_crm_custom_fields_updated_at BEFORE UPDATE ON crm_custom_fields
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_leads ADD COLUMN custom jsonb NOT NULL DEFAULT '{}';
ALTER TABLE crm_companies ADD COLUMN custom jsonb NOT NULL DEFAULT '{}';
ALTER TABLE crm_contacts ADD COLUMN custom jsonb NOT NULL DEFAULT '{}';
ALTER TABLE crm_opportunities ADD COLUMN custom jsonb NOT NULL DEFAULT '{}';

COMMIT;
