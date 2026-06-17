-- ============================================================
-- Migración 004: líneas de producto en oportunidades + forecast
-- Convierte la oportunidad de "un importe suelto" a un presupuesto
-- real con líneas (producto, cantidad, precio, descuento). El importe
-- de la oportunidad pasa a derivarse de la suma de líneas.
-- ============================================================
BEGIN;

CREATE TABLE crm_opportunity_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  opportunity_id   uuid NOT NULL REFERENCES crm_opportunities(id),
  product_id       uuid REFERENCES crm_products(id),
  -- Snapshot del nombre: la línea conserva su descripción aunque el
  -- producto del catálogo cambie o se elimine después.
  name             varchar(160) NOT NULL,
  quantity         numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price       numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  -- Total de línea calculado por la BD: imposible desincronizarlo.
  line_total       numeric(14,2) GENERATED ALWAYS AS
                     (round(quantity * unit_price * (1 - discount_percent / 100.0), 2)) STORED,
  position         int NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES users(id),
  updated_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_items_opp ON crm_opportunity_items(organization_id, opportunity_id);
CREATE TRIGGER trg_opp_items_updated_at BEFORE UPDATE ON crm_opportunity_items
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Marca para saber si el importe de una oportunidad se gestiona por
-- líneas (calculado) o manualmente (compatibilidad hacia atrás).
ALTER TABLE crm_opportunities
  ADD COLUMN amount_is_derived boolean NOT NULL DEFAULT false;

-- Índice para el forecast por mes de cierre previsto.
CREATE INDEX idx_opps_expected_close
  ON crm_opportunities(organization_id, expected_close_date)
  WHERE deleted_at IS NULL AND status = 'open';

COMMIT;
