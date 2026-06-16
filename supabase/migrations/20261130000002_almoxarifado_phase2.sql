-- migration: 20261130000002_almoxarifado_phase2.sql
-- Módulo Almoxarifado (ÒPURA Inventory) — Fase 2
-- Cria: stock_reservations, stock_transfers, stock_transfer_items
-- Altera: work_orders ganha warehouse_id + stock_consumption_enabled
-- Altera: stock_movements ganha transfer_id
-- RPC: fn_consume_stock_for_work_order, fn_create_transfer

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RESERVAS DE ESTOQUE (OE planejada reserva material antes de consumir)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_reservations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id    UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    input_code      TEXT NOT NULL,
    input_description TEXT NOT NULL,
    input_unit      TEXT NOT NULL,
    quantity        NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
    work_order_id   UUID,   -- ref work_orders (sem FK cross-schema)
    status          TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT chk_reservation_status CHECK (status IN ('active','consumed','cancelled')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_res_warehouse   ON public.stock_reservations (warehouse_id, input_code);
CREATE INDEX IF NOT EXISTS idx_stock_res_work_order  ON public.stock_reservations (work_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_res_org         ON public.stock_reservations (organization_id);

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_stock_reservations" ON public.stock_reservations;
CREATE POLICY "org_access_stock_reservations" ON public.stock_reservations
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_stock_res_updated_at ON public.stock_reservations;
CREATE TRIGGER trg_stock_res_updated_at
    BEFORE UPDATE ON public.stock_reservations
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRANSFERÊNCIAS ENTRE ALMOXARIFADOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    to_warehouse_id   UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    status            TEXT NOT NULL DEFAULT 'in_transit',
    CONSTRAINT chk_transfer_status CHECK (status IN ('in_transit','received','cancelled')),
    CONSTRAINT chk_transfer_diff_warehouses CHECK (from_warehouse_id <> to_warehouse_id),
    shipped_at        DATE,
    received_at       DATE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id   UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    input_code    TEXT,
    input_description TEXT NOT NULL,
    input_unit    TEXT NOT NULL,
    quantity      NUMERIC(15,4) NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_org    ON public.stock_transfers (organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from   ON public.stock_transfers (from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to     ON public.stock_transfers (to_warehouse_id);

ALTER TABLE public.stock_transfers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_stock_transfers" ON public.stock_transfers;
CREATE POLICY "org_access_stock_transfers" ON public.stock_transfers
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

-- stock_transfer_items: acesso via join com stock_transfers (RLS na tabela pai)
DROP POLICY IF EXISTS "authenticated_access_transfer_items" ON public.stock_transfer_items;
CREATE POLICY "authenticated_access_transfer_items" ON public.stock_transfer_items
    FOR ALL TO authenticated
    USING (
        transfer_id IN (
            SELECT st.id FROM public.stock_transfers st
            WHERE st.organization_id IN (
                SELECT om.organization_id FROM public.organization_members om
                WHERE om.email = auth.jwt()->>'email'
            )
        )
    )
    WITH CHECK (
        transfer_id IN (
            SELECT st.id FROM public.stock_transfers st
            WHERE st.organization_id IN (
                SELECT om.organization_id FROM public.organization_members om
                WHERE om.email = auth.jwt()->>'email'
            )
        )
    );

DROP TRIGGER IF EXISTS trg_stock_transfers_updated_at ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfers_updated_at
    BEFORE UPDATE ON public.stock_transfers
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VINCULAR ALMOXARIFADO À ORDEM DE EXECUÇÃO (opt-in)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS warehouse_id             UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stock_consumption_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COLUNA transfer_id EM stock_movements (para rastreio)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.stock_transfers(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC — CONSUMO DE ESTOQUE PELA OE
-- Recebe a lista de itens consumidos, lança movimentos 'out', cancela reservas,
-- retorna o custo total (a ser gravado em actual_material_cost da OE).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consume_stock_for_work_order(
    p_work_order_id UUID,
    p_warehouse_id  UUID,
    p_items         JSONB  -- [{input_code, input_description, input_unit, quantity}]
) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
    r_org        UUID;
    r_item       JSONB;
    v_qty        NUMERIC;
    v_avg_cost   NUMERIC;
    v_item_cost  NUMERIC;
    v_total_cost NUMERIC := 0;
BEGIN
    SELECT organization_id INTO r_org FROM public.warehouses WHERE id = p_warehouse_id;

    FOR r_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (r_item->>'quantity')::NUMERIC;

        -- busca custo médio atual para calcular valor do consumo
        SELECT avg_unit_cost INTO v_avg_cost
        FROM public.stock_balances
        WHERE warehouse_id = p_warehouse_id
          AND input_code = COALESCE(r_item->>'input_code', '');

        v_avg_cost  := COALESCE(v_avg_cost, 0);
        v_item_cost := v_qty * v_avg_cost;
        v_total_cost := v_total_cost + v_item_cost;

        -- lança movimento de saída (trigger atualiza saldo automaticamente)
        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, work_order_id, notes, moved_at)
        VALUES
            (r_org, p_warehouse_id,
             r_item->>'input_code',
             r_item->>'input_description',
             r_item->>'input_unit',
             'out', v_qty, v_avg_cost,
             p_work_order_id,
             'Consumo OE',
             CURRENT_DATE);

        -- cancela reservas ativas deste item/OE (best-effort, não falha se não tiver)
        UPDATE public.stock_reservations
        SET status = 'consumed', updated_at = now()
        WHERE work_order_id = p_work_order_id
          AND warehouse_id  = p_warehouse_id
          AND input_code    = COALESCE(r_item->>'input_code', '')
          AND status        = 'active';
    END LOOP;

    -- atualiza actual_material_cost na OE (acumula — pode haver múltiplos consumos)
    UPDATE public.work_orders
    SET actual_material_cost = actual_material_cost + v_total_cost,
        actual_total_cost    = actual_labor_cost + actual_material_cost + v_total_cost
    WHERE id = p_work_order_id;

    RETURN v_total_cost;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC — CONFIRMAR RECEBIMENTO DE TRANSFERÊNCIA
-- Lança transfer_out na origem e transfer_in no destino
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_receive_stock_transfer(
    p_transfer_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_transfer  RECORD;
    r_item      RECORD;
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
        -- custo médio da origem para preservar o valor na transferência
        SELECT avg_unit_cost INTO v_avg_cost
        FROM public.stock_balances
        WHERE warehouse_id = r_transfer.from_warehouse_id
          AND input_code   = COALESCE(r_item.input_code, '');
        v_avg_cost := COALESCE(v_avg_cost, 0);

        -- saída da origem
        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, transfer_id, moved_at)
        VALUES
            (r_transfer.organization_id, r_transfer.from_warehouse_id,
             r_item.input_code, r_item.input_description, r_item.input_unit,
             'transfer_out', r_item.quantity, v_avg_cost, p_transfer_id, CURRENT_DATE);

        -- entrada no destino (mesmo custo médio da origem)
        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, transfer_id, moved_at)
        VALUES
            (r_transfer.organization_id, r_transfer.to_warehouse_id,
             r_item.input_code, r_item.input_description, r_item.input_unit,
             'transfer_in', r_item.quantity, v_avg_cost, p_transfer_id, CURRENT_DATE);
    END LOOP;

    UPDATE public.stock_transfers
    SET status = 'received', received_at = CURRENT_DATE, updated_at = now()
    WHERE id = p_transfer_id;
END;
$$;
