-- migration: 20261130000001_almoxarifado_phase1.sql
-- Módulo Almoxarifado (ÒPURA Inventory) — Fase 1
-- Cria: warehouses, stock_movements, stock_balances, supplier_lead_times
-- Trigger: custo médio ponderado no stock_balances
-- Entrada automática: fn_create_stock_entry_from_receipt

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALMOXARIFADOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,  -- null = central da org
    name              VARCHAR(200) NOT NULL,
    type              VARCHAR(50) NOT NULL DEFAULT 'site',  -- site | central | virtual
    is_active         BOOLEAN NOT NULL DEFAULT true,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_warehouse_name_org UNIQUE (organization_id, project_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LIVRO-RAZÃO DE MOVIMENTOS (fonte de verdade — nunca editar, só inserir)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    warehouse_id      UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,

    -- snapshot do insumo (NÃO FK — orçamento é JSON)
    input_code        TEXT,                 -- código SINAPI/próprio
    input_description TEXT NOT NULL,
    input_unit        TEXT NOT NULL,

    -- tipo de movimento
    type              TEXT NOT NULL,        -- in | out | adjust
    -- transfer_in / transfer_out reservados para Fase 2 (stock_transfers)
    CONSTRAINT chk_movement_type CHECK (type IN ('in','out','adjust','transfer_in','transfer_out')),

    quantity          NUMERIC(15,4) NOT NULL CHECK (quantity > 0),  -- sempre positivo
    unit_cost         NUMERIC(15,4),        -- custo unitário na entrada (usado p/ custo médio)

    -- rastreio de origem (qual estiver preenchido)
    receipt_id        UUID REFERENCES public.purchase_receipts(id) ON DELETE SET NULL,
    work_order_id     UUID,                 -- ref work_orders (sem FK para não criar dep. cruzada de schema)
    notes             TEXT,
    moved_at          DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON public.stock_movements (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_code  ON public.stock_movements (organization_id, input_code);
CREATE INDEX IF NOT EXISTS idx_stock_movements_receipt   ON public.stock_movements (receipt_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SALDO (cache derivado — atualizado pelo trigger abaixo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_balances (
    organization_id   UUID NOT NULL,
    warehouse_id      UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    input_code        TEXT NOT NULL,
    input_description TEXT NOT NULL,
    input_unit        TEXT NOT NULL,
    quantity          NUMERIC(15,4) NOT NULL DEFAULT 0,
    avg_unit_cost     NUMERIC(15,4) NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (warehouse_id, input_code)
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_org ON public.stock_balances (organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER — atualiza saldo e custo médio ponderado
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_update_stock_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_qty      NUMERIC;
    v_cost     NUMERIC;
    v_cur_qty  NUMERIC;
    v_cur_avg  NUMERIC;
    v_new_qty  NUMERIC;
    v_new_avg  NUMERIC;
BEGIN
    -- determina sinal e custo médio
    IF NEW.type IN ('in', 'transfer_in') THEN
        v_qty  :=  NEW.quantity;
        v_cost := COALESCE(NEW.unit_cost, 0);
    ELSIF NEW.type IN ('out', 'transfer_out') THEN
        v_qty  := -NEW.quantity;
        v_cost := 0;
    ELSE -- adjust: pode ser positivo ou negativo; quantity sempre positivo no campo, sinal via notes
        -- para adjust usamos um sinal: ajuste positivo = type 'adjust' com notes 'add' / negativo 'sub'
        -- simplificação Fase 1: adjust é sempre entrada (acerto de inventário positivo ou reposição)
        -- saída por ajuste: inserir movement type='adjust' com notes contendo 'negativo'
        -- o service controla; aqui assumimos positivo
        v_qty  :=  NEW.quantity;
        v_cost := COALESCE(NEW.unit_cost, 0);
    END IF;

    -- lê saldo atual
    SELECT quantity, avg_unit_cost
    INTO v_cur_qty, v_cur_avg
    FROM public.stock_balances
    WHERE warehouse_id = NEW.warehouse_id AND input_code = COALESCE(NEW.input_code, '');

    IF NOT FOUND THEN
        v_cur_qty := 0;
        v_cur_avg := 0;
    END IF;

    v_new_qty := v_cur_qty + v_qty;

    -- custo médio ponderado: só recalcula na entrada
    IF v_qty > 0 AND v_cost > 0 THEN
        IF v_cur_qty + v_qty > 0 THEN
            v_new_avg := (v_cur_qty * v_cur_avg + v_qty * v_cost) / (v_cur_qty + v_qty);
        ELSE
            v_new_avg := v_cost;
        END IF;
    ELSE
        v_new_avg := v_cur_avg; -- saída mantém custo médio
    END IF;

    INSERT INTO public.stock_balances
        (organization_id, warehouse_id, input_code, input_description, input_unit,
         quantity, avg_unit_cost, updated_at)
    VALUES
        (NEW.organization_id, NEW.warehouse_id,
         COALESCE(NEW.input_code, ''), NEW.input_description, NEW.input_unit,
         v_new_qty, v_new_avg, now())
    ON CONFLICT (warehouse_id, input_code) DO UPDATE
        SET quantity          = EXCLUDED.quantity,
            avg_unit_cost     = EXCLUDED.avg_unit_cost,
            input_description = EXCLUDED.input_description,
            input_unit        = EXCLUDED.input_unit,
            updated_at        = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_balance ON public.stock_movements;
CREATE TRIGGER trg_update_stock_balance
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_stock_balance();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ENTRADA AUTOMÁTICA A PARTIR DE RECEIPT
-- Chamada pelo service após confirmar recebimento (status Recebido ou Parcial)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_stock_entry_from_receipt(
    p_receipt_id   UUID,
    p_warehouse_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_org    UUID;
    r_item   RECORD;
    v_cost   NUMERIC;
BEGIN
    -- busca org do almoxarifado
    SELECT organization_id INTO r_org FROM public.warehouses WHERE id = p_warehouse_id;

    -- para cada item do recibo, insere um movimento de entrada
    FOR r_item IN
        SELECT
            pri.order_item_code   AS input_code,
            pri.description       AS input_description,
            pri.unit              AS input_unit,
            pri.quantity_received AS quantity
        FROM public.purchase_receipt_items pri
        WHERE pri.receipt_id = p_receipt_id
          AND pri.quantity_received > 0
    LOOP
        -- tenta buscar o preço unitário do PO correspondente (best-effort)
        SELECT
            CASE
                WHEN po.items IS NOT NULL
                THEN (
                    SELECT (item->>'unitPrice')::NUMERIC
                    FROM jsonb_array_elements(po.items::jsonb) AS item
                    WHERE item->>'code' = r_item.input_code
                    LIMIT 1
                )
                ELSE NULL
            END
        INTO v_cost
        FROM public.purchase_receipts pr
        JOIN public.purchase_orders po ON po.id = pr.order_id
        WHERE pr.id = p_receipt_id
        LIMIT 1;

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, unit_cost, receipt_id, moved_at)
        VALUES
            (r_org, p_warehouse_id,
             r_item.input_code, r_item.input_description, r_item.input_unit,
             'in', r_item.quantity, v_cost, p_receipt_id, CURRENT_DATE);
    END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. LEAD TIME POR FORNECEDOR (para o Plano de Aquisições)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_lead_times (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    input_code      TEXT,                 -- null = vale para qualquer insumo do fornecedor
    category_id     UUID,                 -- ref supplier_categories (sem FK para flexibilidade)
    lead_time_days  INT NOT NULL CHECK (lead_time_days >= 0),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_lead_times_supplier ON public.supplier_lead_times (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_lead_times_org      ON public.supplier_lead_times (organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — padrão da casa (organization_members por email)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.warehouses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_lead_times ENABLE ROW LEVEL SECURITY;

-- helper: org membership check
-- (reutiliza o padrão já estabelecido no projeto)

DROP POLICY IF EXISTS "org_access_warehouses"          ON public.warehouses;
DROP POLICY IF EXISTS "org_access_stock_movements"     ON public.stock_movements;
DROP POLICY IF EXISTS "org_access_stock_balances"      ON public.stock_balances;
DROP POLICY IF EXISTS "org_access_supplier_lead_times" ON public.supplier_lead_times;

CREATE POLICY "org_access_warehouses" ON public.warehouses
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

CREATE POLICY "org_access_stock_movements" ON public.stock_movements
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

CREATE POLICY "org_access_stock_balances" ON public.stock_balances
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

CREATE POLICY "org_access_supplier_lead_times" ON public.supplier_lead_times
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. updated_at triggers (padrão da casa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_warehouses_updated_at          ON public.warehouses;
DROP TRIGGER IF EXISTS trg_supplier_lead_times_updated_at ON public.supplier_lead_times;

CREATE TRIGGER trg_warehouses_updated_at
    BEFORE UPDATE ON public.warehouses
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TRIGGER trg_supplier_lead_times_updated_at
    BEFORE UPDATE ON public.supplier_lead_times
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
