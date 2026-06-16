-- migration: 20261203000001_almoxarifado_stock_items.sql
-- Almoxarifado — catálogo de insumos, ajuste corrigido, estoque máximo

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CORRIGIR tipo 'adjust' no stock_movements
--    Adiciona adjust_in / adjust_out ao CHECK e atualiza o trigger
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS chk_movement_type;

ALTER TABLE public.stock_movements
    ADD CONSTRAINT chk_movement_type
    CHECK (type IN ('in','out','adjust','adjust_in','adjust_out','transfer_in','transfer_out'));

-- Trigger atualizado: adjust_in = entrada positiva, adjust_out = saída
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
    IF NEW.type IN ('in', 'transfer_in', 'adjust', 'adjust_in') THEN
        v_qty  :=  NEW.quantity;
        v_cost := COALESCE(NEW.unit_cost, 0);
    ELSIF NEW.type IN ('out', 'transfer_out', 'adjust_out') THEN
        v_qty  := -NEW.quantity;
        v_cost := 0;
    ELSE
        v_qty  := NEW.quantity;
        v_cost := COALESCE(NEW.unit_cost, 0);
    END IF;

    SELECT quantity, avg_unit_cost
    INTO v_cur_qty, v_cur_avg
    FROM public.stock_balances
    WHERE warehouse_id = NEW.warehouse_id AND input_code = COALESCE(NEW.input_code, '');

    IF NOT FOUND THEN
        v_cur_qty := 0;
        v_cur_avg := 0;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATÁLOGO DE INSUMOS — cadastro mestre por organização
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    input_code          TEXT NOT NULL,
    input_description   TEXT NOT NULL,
    input_unit          TEXT NOT NULL,
    category            TEXT,           -- Cimento | Aço | Madeira | Hidráulica | Elétrica | etc.
    default_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, input_code)
);

CREATE INDEX IF NOT EXISTS idx_stock_items_org      ON public.stock_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_category ON public.stock_items (organization_id, category);

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_stock_items" ON public.stock_items;
CREATE POLICY "org_access_stock_items" ON public.stock_items
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_stock_items_updated_at ON public.stock_items;
CREATE TRIGGER trg_stock_items_updated_at
    BEFORE UPDATE ON public.stock_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ESTOQUE MÁXIMO em stock_min_levels
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_min_levels
    ADD COLUMN IF NOT EXISTS max_quantity NUMERIC(15,4);
