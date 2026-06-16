-- migration: 20261130000004_plano_aquisicoes_phase1.sql
-- Módulo Plano de Aquisições — Fase 1
-- Tabela central procurement_plan_items (gerada pelo motor TypeScript)
-- Motor: explode composições × distribuição × lead time → necessidades de compra

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROCUREMENT_PLAN_ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_plan_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL,
    project_id              UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Versionamento: qual versão do orçamento gerou este item
    budget_version_id       TEXT,       -- settings.versions[].id (pode ser null = versão corrente)
    is_stale                BOOLEAN NOT NULL DEFAULT FALSE,  -- nova versão publicada → marcar stale

    -- Insumo (snapshot da composição)
    input_code              TEXT,       -- código SINAPI da composição ou NULL
    input_description       TEXT NOT NULL,
    input_unit              TEXT NOT NULL,

    -- Origem no orçamento
    source_budget_item_id   TEXT,       -- BudgetEntry.id
    source_budget_item_desc TEXT,       -- snapshot da descrição do item de orçamento
    source_budget_item_unit TEXT,       -- unidade do item de orçamento

    -- Quantidades
    required_qty            NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qtd total necessária no período
    net_required_qty        NUMERIC(15,4) NOT NULL DEFAULT 0,   -- required_qty - posição líquida
    last_net_snapshot_at    TIMESTAMPTZ,                        -- quando foi calculada a posição líquida

    -- Programação
    period_id               TEXT,       -- SchedulePeriod.id (referência ao JSON do projeto)
    period_date             DATE,       -- snapshot da data do período
    need_date               DATE,       -- data que o material precisa estar disponível
    lead_time_days          INT NOT NULL DEFAULT 0,
    suggested_buy_date      DATE,       -- need_date − lead_time_days

    -- Fornecedor / custo sugerido
    suggested_supplier_id   UUID,       -- suppliers.id
    estimated_unit_cost     NUMERIC(15,4) NOT NULL DEFAULT 0,
    estimated_total         NUMERIC(15,4) GENERATED ALWAYS AS (net_required_qty * estimated_unit_cost) STORED,

    -- Consolidação: agrupa mesmo input_code de diferentes itens de orçamento
    consolidation_group_id  UUID,       -- gen na geração; mesmos input_code+period_date compartilham

    -- Workflow
    status                  TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','quoted','ordered','received','cancelled')),
    generated_quotation_id  UUID,       -- quotation_requests.id (se gerou cotação)
    generated_order_id      UUID,       -- purchase_orders.id (se gerou PO)

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppi_org       ON public.procurement_plan_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_ppi_project   ON public.procurement_plan_items (project_id);
CREATE INDEX IF NOT EXISTS idx_ppi_buy_date  ON public.procurement_plan_items (suggested_buy_date);
CREATE INDEX IF NOT EXISTS idx_ppi_status    ON public.procurement_plan_items (status);
CREATE INDEX IF NOT EXISTS idx_ppi_consol    ON public.procurement_plan_items (consolidation_group_id);

ALTER TABLE public.procurement_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_procurement_plan" ON public.procurement_plan_items;
CREATE POLICY "org_access_procurement_plan" ON public.procurement_plan_items
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_ppi_updated_at ON public.procurement_plan_items;
CREATE TRIGGER trg_ppi_updated_at
    BEFORE UPDATE ON public.procurement_plan_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_mark_plan_stale — marca is_stale=true quando nova versão do orçamento
--    é publicada (chamada pelo serviço ao versionar)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mark_plan_stale(p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.procurement_plan_items
    SET is_stale = TRUE, updated_at = now()
    WHERE project_id = p_project_id
      AND status = 'pending';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_procurement_monthly_spend — curva de desembolso por mês
-- ─────────────────────────────────────────────────────────────────────────────
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
LANGUAGE plpgsql STABLE AS $$
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
    WHERE ppi.organization_id = p_organization_id
      AND (p_project_id IS NULL OR ppi.project_id = p_project_id)
      AND ppi.suggested_buy_date IS NOT NULL
      AND ppi.status NOT IN ('cancelled', 'received')
      AND ppi.is_stale = FALSE
    GROUP BY DATE_TRUNC('month', ppi.suggested_buy_date), TO_CHAR(ppi.suggested_buy_date, 'Mon/YYYY')
    ORDER BY 1;
END;
$$;
