-- migration: 20261130000005_plano_aquisicoes_phase3.sql
-- Plano de Aquisições — Fase 3: Consolidação Multi-Obra
--
-- Agrupa necessidades do mesmo insumo + mesmo mês de compra em projetos
-- diferentes da mesma organização, gerando uma cotação/pedido único em volume.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROCUREMENT_CONSOLIDATIONS — grupo de consolidação cross-projeto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_consolidations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL,

    -- Insumo consolidado (snapshot)
    input_code              TEXT,
    input_description       TEXT NOT NULL,
    input_unit              TEXT NOT NULL,

    -- Mês de referência (truncado para o 1º dia do mês)
    period_month            DATE NOT NULL,

    -- Totais agregados dos itens vinculados (mantidos pelo service)
    total_required_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_estimated         NUMERIC(15,4) NOT NULL DEFAULT 0,

    -- Workflow
    status                  TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','quoted','ordered','cancelled')),
    generated_quotation_id  UUID,
    generated_order_id      UUID,

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_org        ON public.procurement_consolidations (organization_id);
CREATE INDEX IF NOT EXISTS idx_pc_input      ON public.procurement_consolidations (input_code);
CREATE INDEX IF NOT EXISTS idx_pc_month      ON public.procurement_consolidations (period_month);

ALTER TABLE public.procurement_consolidations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_procurement_consolidations" ON public.procurement_consolidations;
CREATE POLICY "org_access_procurement_consolidations" ON public.procurement_consolidations
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_pc_updated_at ON public.procurement_consolidations;
CREATE TRIGGER trg_pc_updated_at
    BEFORE UPDATE ON public.procurement_consolidations
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROCUREMENT_CONSOLIDATION_ITEMS — itens do plano vinculados ao grupo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_consolidation_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consolidation_id    UUID NOT NULL REFERENCES public.procurement_consolidations(id) ON DELETE CASCADE,
    plan_item_id        UUID NOT NULL REFERENCES public.procurement_plan_items(id)     ON DELETE CASCADE,
    project_id          UUID NOT NULL,
    project_name        TEXT NOT NULL,   -- snapshot
    required_qty        NUMERIC(15,4) NOT NULL DEFAULT 0,
    estimated_total     NUMERIC(15,4) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (consolidation_id, plan_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pci_consolidation ON public.procurement_consolidation_items (consolidation_id);
CREATE INDEX IF NOT EXISTS idx_pci_plan_item      ON public.procurement_consolidation_items (plan_item_id);

ALTER TABLE public.procurement_consolidation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_pci" ON public.procurement_consolidation_items;
CREATE POLICY "org_access_pci" ON public.procurement_consolidation_items
    FOR ALL TO authenticated
    USING (consolidation_id IN (
        SELECT pc.id FROM public.procurement_consolidations pc
        WHERE pc.organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    ))
    WITH CHECK (consolidation_id IN (
        SELECT pc.id FROM public.procurement_consolidations pc
        WHERE pc.organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_consolidation_opportunities
--
-- Detecta automaticamente oportunidades de consolidação:
-- itens pending/quoted do mesmo insumo no mesmo mês em >= 2 projetos distintos
-- que ainda NÃO estão vinculados a uma consolidação existente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consolidation_opportunities(
    p_organization_id UUID
)
RETURNS TABLE (
    input_code          TEXT,
    input_description   TEXT,
    input_unit          TEXT,
    period_month        DATE,
    project_count       INT,
    total_qty           NUMERIC,
    total_estimated     NUMERIC,
    item_ids            UUID[]
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        ppi.input_code,
        MAX(ppi.input_description)                          AS input_description,
        MAX(ppi.input_unit)                                 AS input_unit,
        DATE_TRUNC('month', ppi.suggested_buy_date)::DATE   AS period_month,
        COUNT(DISTINCT ppi.project_id)::INT                 AS project_count,
        SUM(ppi.net_required_qty)                           AS total_qty,
        SUM(ppi.estimated_total)                            AS total_estimated,
        ARRAY_AGG(ppi.id)                                   AS item_ids
    FROM public.procurement_plan_items ppi
    WHERE ppi.organization_id  = p_organization_id
      AND ppi.status           IN ('pending', 'quoted')
      AND ppi.is_stale         = FALSE
      AND ppi.suggested_buy_date IS NOT NULL
      AND ppi.input_code       IS NOT NULL
      -- exclui itens já vinculados a uma consolidação
      AND ppi.id NOT IN (
          SELECT pci.plan_item_id
          FROM public.procurement_consolidation_items pci
          JOIN public.procurement_consolidations pc ON pc.id = pci.consolidation_id
          WHERE pc.organization_id = p_organization_id
            AND pc.status NOT IN ('cancelled')
      )
    GROUP BY ppi.input_code, DATE_TRUNC('month', ppi.suggested_buy_date)
    HAVING COUNT(DISTINCT ppi.project_id) >= 2
    ORDER BY total_estimated DESC;
END;
$$;
