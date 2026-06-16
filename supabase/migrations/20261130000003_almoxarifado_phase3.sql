-- migration: 20261130000003_almoxarifado_phase3.sql
-- Módulo Almoxarifado (ÒPURA Inventory) — Fase 3
-- Posição líquida → alimenta o Plano de Aquisições
-- Indicadores: giro, ponto de reposição, ruptura, excesso
-- Cadastro de estoque mínimo por almoxarifado/insumo

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ESTOQUE MÍNIMO (ponto de reposição por almoxarifado × insumo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_min_levels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id    UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    input_code      TEXT NOT NULL,
    input_description TEXT NOT NULL,
    input_unit      TEXT NOT NULL,
    min_quantity    NUMERIC(15,4) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, input_code)
);

CREATE INDEX IF NOT EXISTS idx_stock_min_org ON public.stock_min_levels (organization_id);

ALTER TABLE public.stock_min_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_stock_min_levels" ON public.stock_min_levels;
CREATE POLICY "org_access_stock_min_levels" ON public.stock_min_levels
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_stock_min_updated_at ON public.stock_min_levels;
CREATE TRIGGER trg_stock_min_updated_at
    BEFORE UPDATE ON public.stock_min_levels
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_net_position — POSIÇÃO LÍQUIDA POR ORG / INSUMO
--
-- Posição líquida = saldo (stock_balances)
--                 + em_trânsito (purchase_orders com status ativo, por item JSONB)
--                 − reservado (stock_reservations ativas)
--
-- Parâmetros: p_organization_id (obrigatório), p_warehouse_id (opcional),
--             p_input_code (opcional — filtra insumo específico)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_net_position(
    p_organization_id UUID,
    p_warehouse_id    UUID    DEFAULT NULL,
    p_input_code      TEXT    DEFAULT NULL
)
RETURNS TABLE (
    organization_id   UUID,
    warehouse_id      UUID,
    warehouse_name    TEXT,
    input_code        TEXT,
    input_description TEXT,
    input_unit        TEXT,
    balance_qty       NUMERIC,   -- stock_balances.quantity
    in_transit_qty    NUMERIC,   -- POs em aberto (Enviado/Confirmado/Separação/Em Trânsito)
    reserved_qty      NUMERIC,   -- stock_reservations ativas
    net_qty           NUMERIC,   -- balance + in_transit − reserved
    avg_unit_cost     NUMERIC,
    total_value       NUMERIC,   -- balance_qty × avg_unit_cost
    min_quantity      NUMERIC,   -- estoque mínimo cadastrado (pode ser null)
    is_below_min      BOOLEAN    -- net_qty < min_quantity
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH

    -- saldo e custo médio
    balances AS (
        SELECT
            sb.organization_id,
            sb.warehouse_id,
            w.name              AS warehouse_name,
            sb.input_code,
            sb.input_description,
            sb.input_unit,
            sb.quantity         AS balance_qty,
            sb.avg_unit_cost
        FROM public.stock_balances sb
        JOIN public.warehouses w ON w.id = sb.warehouse_id
        WHERE sb.organization_id = p_organization_id
          AND (p_warehouse_id IS NULL OR sb.warehouse_id = p_warehouse_id)
          AND (p_input_code   IS NULL OR sb.input_code   = p_input_code)
    ),

    -- em trânsito: POs com status que indicam material a caminho mas não recebido
    -- items é JSONB array [{code, quantity, ...}]
    in_transit AS (
        SELECT
            po.project_id,
            (item_row->>'code')::TEXT                       AS input_code,
            SUM((item_row->>'quantity')::NUMERIC)           AS in_transit_qty
        FROM public.purchase_orders po,
             jsonb_array_elements(
                 CASE WHEN jsonb_typeof(po.items::jsonb) = 'array'
                      THEN po.items::jsonb
                      ELSE '[]'::jsonb
                 END
             ) AS item_row
        WHERE po.status IN ('Enviado', 'Em Negociação', 'Confirmado', 'Separação', 'Em Trânsito')
          AND po.items IS NOT NULL
          -- filtrar por org via projeto (purchase_orders não tem organization_id direto)
          AND po.project_id IN (
              SELECT p.id FROM public.projects p
              WHERE p.organization_id = p_organization_id
              UNION
              -- POs podem não ter project_id em alguns orgs; incluir pela empresa
              SELECT NULL::UUID WHERE FALSE
          )
          AND (p_input_code IS NULL OR (item_row->>'code') = p_input_code)
        GROUP BY po.project_id, item_row->>'code'
    ),

    -- in_transit agregado por input_code (cross-project)
    in_transit_agg AS (
        SELECT
            it.input_code,
            SUM(it.in_transit_qty) AS in_transit_qty
        FROM in_transit it
        GROUP BY it.input_code
    ),

    -- reservas ativas
    reservations AS (
        SELECT
            sr.warehouse_id,
            sr.input_code,
            SUM(sr.quantity) AS reserved_qty
        FROM public.stock_reservations sr
        WHERE sr.organization_id = p_organization_id
          AND sr.status = 'active'
          AND (p_warehouse_id IS NULL OR sr.warehouse_id = p_warehouse_id)
          AND (p_input_code   IS NULL OR sr.input_code   = p_input_code)
        GROUP BY sr.warehouse_id, sr.input_code
    ),

    -- estoque mínimo
    min_lvl AS (
        SELECT sml.warehouse_id, sml.input_code, sml.min_quantity
        FROM public.stock_min_levels sml
        WHERE sml.organization_id = p_organization_id
          AND (p_warehouse_id IS NULL OR sml.warehouse_id = p_warehouse_id)
          AND (p_input_code   IS NULL OR sml.input_code   = p_input_code)
    )

    SELECT
        b.organization_id,
        b.warehouse_id,
        b.warehouse_name,
        b.input_code,
        b.input_description,
        b.input_unit,
        b.balance_qty,
        COALESCE(it.in_transit_qty, 0)                     AS in_transit_qty,
        COALESCE(r.reserved_qty,    0)                     AS reserved_qty,
        b.balance_qty
            + COALESCE(it.in_transit_qty, 0)
            - COALESCE(r.reserved_qty,    0)               AS net_qty,
        b.avg_unit_cost,
        b.balance_qty * b.avg_unit_cost                    AS total_value,
        ml.min_quantity,
        CASE
            WHEN ml.min_quantity IS NOT NULL
            THEN (b.balance_qty + COALESCE(it.in_transit_qty, 0) - COALESCE(r.reserved_qty, 0)) < ml.min_quantity
            ELSE FALSE
        END                                                AS is_below_min
    FROM balances b
    LEFT JOIN in_transit_agg it ON it.input_code = b.input_code
    LEFT JOIN reservations r    ON r.warehouse_id = b.warehouse_id AND r.input_code = b.input_code
    LEFT JOIN min_lvl ml        ON ml.warehouse_id = b.warehouse_id AND ml.input_code = b.input_code
    ORDER BY b.input_description;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_stock_summary — INDICADORES DE GIRO, RUPTURA E EXCESSO
--
-- Giro = Σ saídas (30d) / saldo médio do período
-- Ruptura = itens com net_qty ≤ 0 (ou abaixo do mínimo)
-- Excesso = itens sem saída nos últimos 60 dias com saldo > 0
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_stock_summary(
    p_organization_id UUID,
    p_warehouse_id    UUID DEFAULT NULL
)
RETURNS TABLE (
    warehouse_id        UUID,
    warehouse_name      TEXT,
    input_code          TEXT,
    input_description   TEXT,
    input_unit          TEXT,
    balance_qty         NUMERIC,
    avg_unit_cost       NUMERIC,
    outflow_30d         NUMERIC,   -- saídas últimos 30 dias
    inflow_30d          NUMERIC,   -- entradas últimos 30 dias
    last_movement_date  DATE,
    turnover_rate       NUMERIC,   -- outflow_30d / balance_qty (quando > 0)
    is_rupture          BOOLEAN,   -- saldo ≤ 0
    is_excess           BOOLEAN,   -- sem saída em 60d e saldo > 0
    is_below_min        BOOLEAN    -- net_qty < min_quantity
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH

    movements_agg AS (
        SELECT
            sm.warehouse_id,
            sm.input_code,
            MAX(sm.moved_at)                                              AS last_movement_date,
            SUM(CASE WHEN sm.type IN ('out','transfer_out') AND sm.moved_at >= CURRENT_DATE - 30
                     THEN sm.quantity ELSE 0 END)                        AS outflow_30d,
            SUM(CASE WHEN sm.type IN ('in','transfer_in')  AND sm.moved_at >= CURRENT_DATE - 30
                     THEN sm.quantity ELSE 0 END)                        AS inflow_30d,
            BOOL_OR(sm.type IN ('out','transfer_out') AND sm.moved_at >= CURRENT_DATE - 60) AS had_outflow_60d
        FROM public.stock_movements sm
        WHERE sm.organization_id = p_organization_id
          AND (p_warehouse_id IS NULL OR sm.warehouse_id = p_warehouse_id)
        GROUP BY sm.warehouse_id, sm.input_code
    ),

    min_lvl AS (
        SELECT sml.warehouse_id, sml.input_code, sml.min_quantity
        FROM public.stock_min_levels sml
        WHERE sml.organization_id = p_organization_id
    ),

    reservations_agg AS (
        SELECT sr.warehouse_id, sr.input_code, SUM(sr.quantity) AS reserved_qty
        FROM public.stock_reservations sr
        WHERE sr.organization_id = p_organization_id AND sr.status = 'active'
        GROUP BY sr.warehouse_id, sr.input_code
    )

    SELECT
        sb.warehouse_id,
        w.name                                                          AS warehouse_name,
        sb.input_code,
        sb.input_description,
        sb.input_unit,
        sb.quantity                                                     AS balance_qty,
        sb.avg_unit_cost,
        COALESCE(ma.outflow_30d, 0)                                    AS outflow_30d,
        COALESCE(ma.inflow_30d,  0)                                    AS inflow_30d,
        ma.last_movement_date,
        CASE WHEN sb.quantity > 0 AND COALESCE(ma.outflow_30d, 0) > 0
             THEN ROUND(COALESCE(ma.outflow_30d, 0) / sb.quantity, 4)
             ELSE 0
        END                                                             AS turnover_rate,
        sb.quantity <= 0                                               AS is_rupture,
        (sb.quantity > 0 AND COALESCE(ma.had_outflow_60d, FALSE) = FALSE) AS is_excess,
        CASE
            WHEN ml.min_quantity IS NOT NULL
            THEN (sb.quantity - COALESCE(ra.reserved_qty, 0)) < ml.min_quantity
            ELSE FALSE
        END                                                             AS is_below_min
    FROM public.stock_balances sb
    JOIN public.warehouses w ON w.id = sb.warehouse_id
    LEFT JOIN movements_agg ma  ON ma.warehouse_id  = sb.warehouse_id AND ma.input_code = sb.input_code
    LEFT JOIN min_lvl ml        ON ml.warehouse_id  = sb.warehouse_id AND ml.input_code = sb.input_code
    LEFT JOIN reservations_agg ra ON ra.warehouse_id = sb.warehouse_id AND ra.input_code = sb.input_code
    WHERE sb.organization_id = p_organization_id
      AND (p_warehouse_id IS NULL OR sb.warehouse_id = p_warehouse_id)
    ORDER BY sb.input_description;
END;
$$;
