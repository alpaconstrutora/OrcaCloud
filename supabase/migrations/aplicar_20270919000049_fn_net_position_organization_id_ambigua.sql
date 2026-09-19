-- migration: aplicar_20270919000049_fn_net_position_organization_id_ambigua.sql (nasceu como 000031 — renumerada antes do push por colisão com main)
-- Almoxarifado — fn_net_position quebrada desde 20270129000004 (42702).
-- Ver docs/planos/2026-09-19-almoxarifado-importar-itens-gestao-de-ativos.md
--
-- Defeito: a função é RETURNS TABLE(organization_id, ...) e o bloco que
-- calcula as organizações do usuário fazia
--     SELECT DISTINCT organization_id FROM public.organization_members
-- sem qualificar. Em plpgsql, `organization_id` aí é ambíguo entre a coluna
-- da tabela e o parâmetro de saída → toda chamada respondia
--     42702 column reference "organization_id" is ambiguous
-- No frontend, inventoryService.getNetPositions lança, o Promise.all do
-- load() em InventoryModule rejeita, e Saldos / Movimentos / KPIs do módulo
-- inteiro ficavam vazios ("Nenhum item em estoque", KPIs zerados) para
-- qualquer organização — erro engolido virando número plausível. Encontrado
-- em 2026-09-19 ao verificar a aba "Gestão de Ativos" na tela, com o banco
-- provadamente contendo saldo.
--
-- Correção: corpo IDÊNTICO ao de 20270129000004 (fonte: o arquivo, não o
-- banco), só com `om.` / `bp.` nas duas linhas. fn_stock_summary, definida
-- no mesmo arquivo, não tem organization_id entre as colunas de saída e não
-- sofre do problema — fica como está.
--
-- REGRA #7: REVOKE PUBLIC/anon + GRANT authenticated na mesma migration.

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
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT om.organization_id FROM public.organization_members om
    WHERE (om.user_id IS NOT NULL AND om.user_id = auth.uid())
       OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT bp.organization_id FROM public.broker_profiles bp
    WHERE LOWER(bp.email) = LOWER(auth.jwt()->>'email') AND bp.is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

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
        WHERE sb.organization_id = ANY(v_targets)
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
              WHERE p.organization_id = ANY(v_targets)
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
        WHERE sr.organization_id = ANY(v_targets)
          AND sr.status = 'active'
          AND (p_warehouse_id IS NULL OR sr.warehouse_id = p_warehouse_id)
          AND (p_input_code   IS NULL OR sr.input_code   = p_input_code)
        GROUP BY sr.warehouse_id, sr.input_code
    ),

    min_lvl AS (
        SELECT sml.warehouse_id, sml.input_code, sml.min_quantity
        FROM public.stock_min_levels sml
        WHERE sml.organization_id = ANY(v_targets)
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

REVOKE EXECUTE ON FUNCTION public.fn_net_position(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_net_position(uuid, uuid, text) TO authenticated;
