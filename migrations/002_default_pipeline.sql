-- ============================================================
-- Migración 002: función para crear el pipeline por defecto de
-- una organización. Se invoca al dar de alta un tenant (seed-dev
-- la usa; en producción la llamará el flujo de onboarding).
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION crm_create_default_pipeline(p_org uuid, p_user uuid DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO crm_pipeline_stages
    (organization_id, name, position, probability_default, is_won, is_lost, color, created_by)
  VALUES
    (p_org, 'Nuevo',           1,  10, false, false, '#64748b', p_user),
    (p_org, 'Contactado',      2,  25, false, false, '#0ea5e9', p_user),
    (p_org, 'Demo / Reunión',  3,  50, false, false, '#8b5cf6', p_user),
    (p_org, 'Propuesta',       4,  70, false, false, '#f59e0b', p_user),
    (p_org, 'Negociación',     5,  85, false, false, '#f97316', p_user),
    (p_org, 'Ganado',          6, 100, true,  false, '#22c55e', p_user),
    (p_org, 'Perdido',         7,   0, false, true,  '#ef4444', p_user)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMIT;
