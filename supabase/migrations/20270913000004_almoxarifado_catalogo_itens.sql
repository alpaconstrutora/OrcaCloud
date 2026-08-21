-- migration: 20270913000004_almoxarifado_catalogo_itens.sql
-- Almoxarifado — Cadastro de Itens (avulsos, de obras antigas, base e planilha)
-- Ver docs/planos/2026-08-21-almoxarifado-cadastro-de-itens.md
--
-- Problema corrigido na raiz: `stock_balances` é chaveada por
-- (warehouse_id, input_code) e o trigger de saldo normaliza código vazio para
-- '' (COALESCE(NEW.input_code,'')). Como o código sempre foi opcional na UI,
-- todo item sem código de um mesmo almoxarifado colapsava numa única linha de
-- saldo. A partir desta migration:
--   1. `stock_items` gera o próprio código (AVU-000001, sequencial por org)
--      quando não vem preenchido — via trigger BEFORE INSERT.
--   2. Todo INSERT em `stock_movements` passa por um resolvedor que garante
--      um input_code real antes do trigger de saldo rodar (fn_resolve_stock_item_code).
--   3. As RPCs que fazem lookup de custo médio ANTES de inserir o movimento
--      (fn_consume_stock_for_work_order, fn_receive_stock_transfer) passam a
--      resolver o código pelo mesmo caminho, para não ler saldo pela chave
--      errada.
--   4. Backfill: dados já gravados com código vazio são migrados para itens
--      reais do catálogo e os saldos recalculados a partir do razão completo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 — EVOLUIR stock_items (rastreio de origem da importação)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_items
    ADD COLUMN IF NOT EXISTS source            TEXT,   -- avulso | catalogo | orcamento | planilha | recebimento
    ADD COLUMN IF NOT EXISTS origin_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_cost_hint    NUMERIC(15,4);  -- último preço conhecido na importação

ALTER TABLE public.stock_items
    DROP CONSTRAINT IF EXISTS chk_stock_items_source;
ALTER TABLE public.stock_items
    ADD CONSTRAINT chk_stock_items_source
    CHECK (source IS NULL OR source IN ('avulso','catalogo','orcamento','planilha','recebimento'));

CREATE INDEX IF NOT EXISTS idx_stock_items_desc_trgm
    ON public.stock_items USING gin (input_description gin_trgm_ops);

-- input_code deixa de ser obrigatório na entrada — o trigger da seção 1.2
-- preenche quando vier vazio. A UNIQUE (organization_id, input_code) segue
-- garantindo que o código gerado nunca colida.
ALTER TABLE public.stock_items
    ALTER COLUMN input_code DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 — GERADOR DE CÓDIGO ATÔMICO (AVU-000001, sequencial por organização)
-- MAX(...)+1 sob advisory lock — não COUNT(*)+1 (mesmo defeito de
-- fn_next_material_request_number, 20261203000002:142).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_next_stock_item_code(
    p_organization_id UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_seq INT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('stock_item_code:' || p_organization_id::text));

    SELECT COALESCE(MAX(substring(input_code FROM 'AVU-(\d+)')::INT), 0) + 1
    INTO v_seq
    FROM public.stock_items
    WHERE organization_id = p_organization_id
      AND input_code ~ '^AVU-\d+$';

    RETURN 'AVU-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_next_stock_item_code(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_next_stock_item_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_next_stock_item_code(UUID) TO authenticated;

-- Trigger: todo INSERT em stock_items sem código ganha um AVU-XXXXXX. Cobre o
-- cadastro manual (StockItemSheet) e qualquer INSERT feito por outra rotina.
CREATE OR REPLACE FUNCTION public.fn_stock_items_generate_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.input_code IS NULL OR btrim(NEW.input_code) = '' THEN
        NEW.input_code := public.fn_next_stock_item_code(NEW.organization_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_items_generate_code ON public.stock_items;
CREATE TRIGGER trg_stock_items_generate_code
    BEFORE INSERT ON public.stock_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_stock_items_generate_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 — RESOLVEDOR DE ITEM (usado pelo trigger de stock_movements e pelas RPCs
-- que fazem lookup de custo médio antes de inserir o movimento)
--
-- Código presente  → garante a linha em stock_items (ON CONFLICT DO NOTHING) e
--                     devolve o mesmo código.
-- Código ausente   → procura item da mesma org por descrição+unidade
--                     (unaccent/lower, para "Cimento CP-II" == "cimento cp ii");
--                     achou, devolve o código existente; não achou, cria um
--                     item novo (source='avulso') e devolve o código gerado
--                     pelo trigger da seção 1.2.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolve_stock_item_code(
    p_organization_id UUID,
    p_code            TEXT,
    p_description     TEXT,
    p_unit            TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_code TEXT;
BEGIN
    IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
        INSERT INTO public.stock_items (organization_id, input_code, input_description, input_unit, source)
        VALUES (p_organization_id, p_code, p_description, p_unit, 'catalogo')
        ON CONFLICT (organization_id, input_code) DO NOTHING;
        RETURN p_code;
    END IF;

    SELECT si.input_code INTO v_code
    FROM public.stock_items si
    WHERE si.organization_id = p_organization_id
      AND si.is_active
      AND unaccent(lower(si.input_description)) = unaccent(lower(p_description))
      AND si.input_unit = p_unit
    ORDER BY si.created_at
    LIMIT 1;

    IF v_code IS NOT NULL THEN
        RETURN v_code;
    END IF;

    INSERT INTO public.stock_items (organization_id, input_description, input_unit, source)
    VALUES (p_organization_id, p_description, p_unit, 'avulso')
    RETURNING input_code INTO v_code;  -- gerado pelo trigger da seção 1.2

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_stock_item_code(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_resolve_stock_item_code(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_resolve_stock_item_code(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Trigger: todo INSERT em stock_movements passa pelo resolvedor ANTES do
-- trigger de saldo (trg_update_stock_balance é AFTER INSERT — roda depois,
-- já lendo o input_code corrigido).
CREATE OR REPLACE FUNCTION public.fn_stock_movement_resolve_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.input_code := public.fn_resolve_stock_item_code(
        NEW.organization_id, NEW.input_code, NEW.input_description, NEW.input_unit
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_resolve_item ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_resolve_item
    BEFORE INSERT ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION public.fn_stock_movement_resolve_item();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3b — RPCs que faziam lookup de saldo ANTES de inserir o movimento: passam
-- a resolver o código pelo mesmo caminho, para consultar/gravar pela chave
-- correta (senão o lookup de custo médio lia por '' e voltava 0 depois do
-- backfill mover os saldos para códigos reais).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consume_stock_for_work_order(
    p_work_order_id UUID,
    p_warehouse_id  UUID,
    p_items         JSONB  -- [{input_code, input_description, input_unit, quantity}]
) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
    r_org        UUID;
    r_item       JSONB;
    v_code       TEXT;
    v_qty        NUMERIC;
    v_avg_cost   NUMERIC;
    v_item_cost  NUMERIC;
    v_total_cost NUMERIC := 0;
BEGIN
    SELECT organization_id INTO r_org FROM public.warehouses WHERE id = p_warehouse_id;

    FOR r_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty  := (r_item->>'quantity')::NUMERIC;
        v_code := public.fn_resolve_stock_item_code(
            r_org, r_item->>'input_code', r_item->>'input_description', r_item->>'input_unit'
        );

        SELECT avg_unit_cost INTO v_avg_cost
        FROM public.stock_balances
        WHERE warehouse_id = p_warehouse_id AND input_code = v_code;

        v_avg_cost  := COALESCE(v_avg_cost, 0);
        v_item_cost := v_qty * v_avg_cost;
        v_total_cost := v_total_cost + v_item_cost;

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, work_order_id, notes, moved_at)
        VALUES
            (r_org, p_warehouse_id, v_code,
             r_item->>'input_description', r_item->>'input_unit',
             'out', v_qty, v_avg_cost, p_work_order_id, 'Consumo OE', CURRENT_DATE);

        UPDATE public.stock_reservations
        SET status = 'consumed', updated_at = now()
        WHERE work_order_id = p_work_order_id
          AND warehouse_id  = p_warehouse_id
          AND input_code    = v_code
          AND status        = 'active';
    END LOOP;

    UPDATE public.work_orders
    SET actual_material_cost = actual_material_cost + v_total_cost,
        actual_total_cost    = actual_labor_cost + actual_material_cost + v_total_cost
    WHERE id = p_work_order_id;

    RETURN v_total_cost;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_consume_stock_for_work_order(UUID, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.fn_consume_stock_for_work_order(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_consume_stock_for_work_order(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_receive_stock_transfer(
    p_transfer_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_transfer  RECORD;
    r_item      RECORD;
    v_code      TEXT;
    v_avg_cost  NUMERIC;
BEGIN
    SELECT * INTO r_transfer FROM public.stock_transfers WHERE id = p_transfer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
    IF r_transfer.status <> 'in_transit' THEN
        RAISE EXCEPTION 'Transferência já foi recebida ou cancelada';
    END IF;

    FOR r_item IN
        SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        v_code := public.fn_resolve_stock_item_code(
            r_transfer.organization_id, r_item.input_code, r_item.input_description, r_item.input_unit
        );

        SELECT avg_unit_cost INTO v_avg_cost
        FROM public.stock_balances
        WHERE warehouse_id = r_transfer.from_warehouse_id AND input_code = v_code;
        v_avg_cost := COALESCE(v_avg_cost, 0);

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, transfer_id, moved_at)
        VALUES
            (r_transfer.organization_id, r_transfer.from_warehouse_id,
             v_code, r_item.input_description, r_item.input_unit,
             'transfer_out', r_item.quantity, v_avg_cost, p_transfer_id, CURRENT_DATE);

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, transfer_id, moved_at)
        VALUES
            (r_transfer.organization_id, r_transfer.to_warehouse_id,
             v_code, r_item.input_description, r_item.input_unit,
             'transfer_in', r_item.quantity, v_avg_cost, p_transfer_id, CURRENT_DATE);
    END LOOP;

    UPDATE public.stock_transfers
    SET status = 'received', received_at = CURRENT_DATE, updated_at = now()
    WHERE id = p_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_receive_stock_transfer(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_receive_stock_transfer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_receive_stock_transfer(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 — BACKFILL: migra stock_movements com código vazio para itens reais do
-- catálogo e recalcula os saldos afetados a partir do razão completo (mesma
-- fórmula de custo médio ponderado de fn_update_stock_balance). Sem linhas
-- afetadas, o bloco todo é no-op.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_group    RECORD;
    v_new_code TEXT;
    v_row      RECORD;
    v_qty      NUMERIC;
    v_cost     NUMERIC;
    v_cur_qty  NUMERIC;
    v_cur_avg  NUMERIC;
    v_new_qty  NUMERIC;
    v_new_avg  NUMERIC;
BEGIN
    CREATE TEMP TABLE _stock_backfill_targets (
        warehouse_id       UUID,
        input_code         TEXT,
        organization_id    UUID,
        input_description  TEXT,
        input_unit         TEXT
    ) ON COMMIT DROP;

    -- 1) resolve/gera código para cada (org, descrição, unidade) hoje sem código
    FOR v_group IN
        SELECT DISTINCT organization_id, input_description, input_unit
        FROM public.stock_movements
        WHERE input_code IS NULL OR btrim(input_code) = ''
    LOOP
        v_new_code := public.fn_resolve_stock_item_code(
            v_group.organization_id, NULL, v_group.input_description, v_group.input_unit
        );

        UPDATE public.stock_movements
        SET input_code = v_new_code
        WHERE organization_id = v_group.organization_id
          AND input_description = v_group.input_description
          AND input_unit = v_group.input_unit
          AND (input_code IS NULL OR btrim(input_code) = '');

        INSERT INTO _stock_backfill_targets (warehouse_id, input_code, organization_id, input_description, input_unit)
        SELECT DISTINCT warehouse_id, v_new_code, v_group.organization_id, v_group.input_description, v_group.input_unit
        FROM public.stock_movements
        WHERE organization_id = v_group.organization_id AND input_code = v_new_code;
    END LOOP;

    -- 2) apaga os saldos corrompidos (chave '')
    DELETE FROM public.stock_balances WHERE input_code = '';

    -- 3) recalcula saldo/custo médio, reaplicando a fórmula do trigger de
    --    saldo na ordem cronológica dos movimentos, para cada par afetado
    FOR v_group IN
        SELECT DISTINCT warehouse_id, input_code, organization_id, input_description, input_unit
        FROM _stock_backfill_targets
    LOOP
        v_cur_qty := 0;
        v_cur_avg := 0;

        FOR v_row IN
            SELECT type, quantity, unit_cost
            FROM public.stock_movements
            WHERE warehouse_id = v_group.warehouse_id AND input_code = v_group.input_code
            ORDER BY moved_at, created_at
        LOOP
            IF v_row.type IN ('in', 'transfer_in', 'adjust', 'adjust_in') THEN
                v_qty  :=  v_row.quantity;
                v_cost := COALESCE(v_row.unit_cost, 0);
            ELSIF v_row.type IN ('out', 'transfer_out', 'adjust_out') THEN
                v_qty  := -v_row.quantity;
                v_cost := 0;
            ELSE
                v_qty  :=  v_row.quantity;
                v_cost := COALESCE(v_row.unit_cost, 0);
            END IF;

            v_new_qty := v_cur_qty + v_qty;

            IF v_qty > 0 AND v_cost > 0 THEN
                IF v_cur_qty + v_qty > 0 THEN
                    v_new_avg := (v_cur_qty * v_cur_avg + v_qty * v_cost) / (v_cur_qty + v_qty);
                ELSE
                    v_new_avg := v_cost;
                END IF;
            ELSE
                v_new_avg := v_cur_avg;
            END IF;

            v_cur_qty := v_new_qty;
            v_cur_avg := v_new_avg;
        END LOOP;

        INSERT INTO public.stock_balances
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             quantity, avg_unit_cost, updated_at)
        VALUES
            (v_group.organization_id, v_group.warehouse_id, v_group.input_code,
             v_group.input_description, v_group.input_unit, v_cur_qty, v_cur_avg, now())
        ON CONFLICT (warehouse_id, input_code) DO UPDATE
            SET quantity          = EXCLUDED.quantity,
                avg_unit_cost     = EXCLUDED.avg_unit_cost,
                input_description = EXCLUDED.input_description,
                input_unit        = EXCLUDED.input_unit,
                updated_at        = now();
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.5 — RLS: stock_items já tem "org_access_stock_items" (FOR ALL, cobre as
-- colunas novas automaticamente). As funções desta migration são SECURITY
-- INVOKER (nenhuma precisa de DEFINER — RLS de stock_items/stock_movements/
-- stock_balances já restringe por organização do usuário autenticado).
-- ─────────────────────────────────────────────────────────────────────────────
