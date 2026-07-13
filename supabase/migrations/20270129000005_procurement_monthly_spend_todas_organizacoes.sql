-- ============================================================
-- fn_procurement_monthly_spend — aceita p_organization_id NULL
-- OrçaCloud SaaS · Migration 20270129000005
--
-- Diferente da família fn_opura_*/fn_bi_*, esta função é sempre
-- chamada com p_project_id preenchido pela tela (Plano de Aquisições
-- exige uma obra selecionada) — o projeto já restringe a uma única
-- organização, então basta relaxar a igualdade para aceitar NULL,
-- sem precisar computar a lista de organizações do usuário (RLS de
-- procurement_plan_items continua sendo a proteção real, já que a
-- função não é SECURITY DEFINER).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_procurement_monthly_spend(
    p_organization_id UUID,
    p_project_id      UUID DEFAULT NULL
)
RETURNS TABLE (
    month_date          DATE,
    month_label         TEXT,
    estimated_spend     NUMERIC,
    pending_count       INT,
    quoted_count        INT,
    ordered_count       INT
)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE_TRUNC('month', ppi.suggested_buy_date)::DATE           AS month_date,
        TO_CHAR(ppi.suggested_buy_date, 'Mon/YYYY')                 AS month_label,
        SUM(ppi.estimated_total)                                     AS estimated_spend,
        COUNT(*) FILTER (WHERE ppi.status = 'pending')::INT         AS pending_count,
        COUNT(*) FILTER (WHERE ppi.status = 'quoted')::INT          AS quoted_count,
        COUNT(*) FILTER (WHERE ppi.status = 'ordered')::INT         AS ordered_count
    FROM public.procurement_plan_items ppi
    WHERE (p_organization_id IS NULL OR ppi.organization_id = p_organization_id)
      AND (p_project_id IS NULL OR ppi.project_id = p_project_id)
      AND ppi.suggested_buy_date IS NOT NULL
      AND ppi.status NOT IN ('cancelled', 'received')
      AND ppi.is_stale = FALSE
    GROUP BY DATE_TRUNC('month', ppi.suggested_buy_date), TO_CHAR(ppi.suggested_buy_date, 'Mon/YYYY')
    ORDER BY 1;
END;
$$;

-- FIM: 20270129000005_procurement_monthly_spend_todas_organizacoes.sql
