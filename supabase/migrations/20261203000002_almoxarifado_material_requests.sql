-- migration: 20261203000002_almoxarifado_material_requests.sql
-- Almoxarifado — requisições de materiais com fluxo de aprovação

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MATERIAL_REQUESTS — cabeçalho da requisição
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    warehouse_id    UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    number          TEXT NOT NULL,          -- MR-2026-001
    requested_by    TEXT NOT NULL,
    approved_by     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','separated','delivered','cancelled')),
    notes           TEXT,
    requested_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_at     DATE,
    delivered_at    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mr_org       ON public.material_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_mr_project   ON public.material_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_mr_warehouse ON public.material_requests (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mr_status    ON public.material_requests (status);

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_material_requests" ON public.material_requests;
CREATE POLICY "org_access_material_requests" ON public.material_requests
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_mr_updated_at ON public.material_requests;
CREATE TRIGGER trg_mr_updated_at
    BEFORE UPDATE ON public.material_requests
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MATERIAL_REQUEST_ITEMS — itens de cada requisição
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_request_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
    input_code          TEXT,
    input_description   TEXT NOT NULL,
    input_unit          TEXT NOT NULL,
    quantity_requested  NUMERIC(15,4) NOT NULL CHECK (quantity_requested > 0),
    quantity_approved   NUMERIC(15,4),
    quantity_delivered  NUMERIC(15,4),
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_mri_request ON public.material_request_items (request_id);

ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_material_request_items" ON public.material_request_items;
CREATE POLICY "org_access_material_request_items" ON public.material_request_items
    FOR ALL TO authenticated
    USING (request_id IN (
        SELECT mr.id FROM public.material_requests mr
        WHERE mr.organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    ))
    WITH CHECK (request_id IN (
        SELECT mr.id FROM public.material_requests mr
        WHERE mr.organization_id IN (
            SELECT om.organization_id FROM public.organization_members om
            WHERE om.email = auth.jwt()->>'email'
        )
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_deliver_material_request
--    Entrega a requisição: lança stock 'out' para cada item aprovado
--    e atualiza status → 'delivered'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_deliver_material_request(
    p_request_id UUID,
    p_delivered_by TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_req   RECORD;
    r_item  RECORD;
    v_qty   NUMERIC;
BEGIN
    SELECT * INTO r_req FROM public.material_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Requisição não encontrada'; END IF;
    IF r_req.status NOT IN ('approved','separated') THEN
        RAISE EXCEPTION 'Requisição precisa estar aprovada ou separada para entregar';
    END IF;
    IF r_req.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Requisição sem almoxarifado definido';
    END IF;

    FOR r_item IN
        SELECT * FROM public.material_request_items WHERE request_id = p_request_id
    LOOP
        v_qty := COALESCE(r_item.quantity_approved, r_item.quantity_requested);
        IF v_qty <= 0 THEN CONTINUE; END IF;

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, notes, moved_at)
        VALUES
            (r_req.organization_id, r_req.warehouse_id,
             r_item.input_code, r_item.input_description, r_item.input_unit,
             'out', v_qty,
             'Requisição ' || r_req.number,
             CURRENT_DATE);

        UPDATE public.material_request_items
        SET quantity_delivered = v_qty
        WHERE id = r_item.id;
    END LOOP;

    UPDATE public.material_requests
    SET status       = 'delivered',
        delivered_at = CURRENT_DATE,
        approved_by  = COALESCE(p_delivered_by, approved_by),
        updated_at   = now()
    WHERE id = p_request_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_next_material_request_number — gera número sequencial por org/ano
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_next_material_request_number(
    p_organization_id UUID
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_year  TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_seq   INT;
BEGIN
    SELECT COUNT(*) + 1
    INTO v_seq
    FROM public.material_requests
    WHERE organization_id = p_organization_id
      AND TO_CHAR(created_at, 'YYYY') = v_year;

    RETURN 'MR-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;
