-- fix: fn_net_position e fn_stock_summary falham com
-- "structure of query does not match function result type"
-- porque warehouses.name é VARCHAR(200) mas as funções declaram TEXT.
-- Solução: cast explícito w.name::TEXT nas CTEs/SELECTs.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_net_position
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
    balance_qty       NUMERIC,
    in_transit_qty    NUMERIC,
    reserved_qty      NUMERIC,
    net_qty           NUMERIC,
    avg_unit_cost     NUMERIC,
    total_value       NUMERIC,
    min_quantity      NUMERIC,
    is_below_min      BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH

    balances AS (
        SELECT
            sb.organization_id,
            sb.warehouse_id,
            w.name::TEXT        AS warehouse_name,
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
          AND po.project_id IN (
              SELECT p.id FROM public.projects p
              WHERE p.organization_id = p_organization_id
              UNION
              SELECT NULL::UUID WHERE FALSE
          )
          AND (p_input_code IS NULL OR (item_row->>'code') = p_input_code)
        GROUP BY po.project_id, item_row->>'code'
    ),

    in_transit_agg AS (
        SELECT
            it.input_code,
            SUM(it.in_transit_qty) AS in_transit_qty
        FROM in_transit it
        GROUP BY it.input_code
    ),

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
-- 2. fn_stock_summary
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
    outflow_30d         NUMERIC,
    inflow_30d          NUMERIC,
    last_movement_date  DATE,
    turnover_rate       NUMERIC,
    is_rupture          BOOLEAN,
    is_excess           BOOLEAN,
    is_below_min        BOOLEAN
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
        w.name::TEXT                                                    AS warehouse_name,
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
