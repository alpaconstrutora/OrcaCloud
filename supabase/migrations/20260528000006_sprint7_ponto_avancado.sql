-- ============================================================
-- Sprint 7: Ponto Avançado + Banco de Horas
-- ============================================================

-- 1. Adicionar campos de geolocalização ao time_entries
ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS geo_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_lng       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_accuracy  NUMERIC(8,2),     -- metros
    ADD COLUMN IF NOT EXISTS geo_address   TEXT,
    ADD COLUMN IF NOT EXISTS check_in_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS check_out_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS entry_method  TEXT DEFAULT 'manual'
        CHECK (entry_method IN ('manual','qr_code','geo','app'));

-- 2. QR CODES POR OBRA
CREATE TABLE IF NOT EXISTS public.qr_codes_obra (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    project_name TEXT,
    token       TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    label       TEXT,           -- Ex: "Portão Principal", "Andar 3"
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at  TIMESTAMPTZ,
    scan_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_org   ON public.qr_codes_obra(org_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON public.qr_codes_obra(token) WHERE is_active = TRUE;

-- 3. BANCO DE HORAS
CREATE TABLE IF NOT EXISTS public.time_bank (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    -- Saldo calculado (créditos - débitos)
    saldo_horas     NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Limites configuráveis
    limite_maximo   NUMERIC(8,2) DEFAULT 120,    -- horas máx acumuláveis
    limite_negativo NUMERIC(8,2) DEFAULT -20,    -- horas de débito permitidas
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_time_bank_org      ON public.time_bank(org_id);
CREATE INDEX IF NOT EXISTS idx_time_bank_employee ON public.time_bank(employee_id);

-- 4. MOVIMENTAÇÕES DO BANCO DE HORAS
CREATE TABLE IF NOT EXISTS public.time_bank_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    time_entry_id   UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('CREDITO','DEBITO','AJUSTE','COMPENSACAO')),
    horas           NUMERIC(6,2) NOT NULL,        -- sempre positivo
    descricao       TEXT,
    referencia_data DATE,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tbe_employee ON public.time_bank_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_tbe_org      ON public.time_bank_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_tbe_date     ON public.time_bank_entries(referencia_data);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.qr_codes_obra      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_bank          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_bank_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_codes_org_access"     ON public.qr_codes_obra      FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "time_bank_org_access"    ON public.time_bank           FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "time_bank_entries_access"ON public.time_bank_entries   FOR ALL USING (public.is_org_member(org_id));

-- Leitura pública de QR (necessário para check-in sem login)
CREATE POLICY "qr_codes_public_read" ON public.qr_codes_obra
    FOR SELECT USING (is_active = TRUE);

-- ============================================================
-- FUNÇÃO: atualizar saldo no time_bank ao inserir movimentação
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_time_bank_balance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.time_bank (org_id, employee_id, saldo_horas)
    VALUES (NEW.org_id, NEW.employee_id, 0)
    ON CONFLICT (employee_id) DO NOTHING;

    UPDATE public.time_bank
    SET
        saldo_horas = saldo_horas + CASE
            WHEN NEW.tipo IN ('CREDITO','AJUSTE') THEN  NEW.horas
            WHEN NEW.tipo IN ('DEBITO','COMPENSACAO')  THEN -NEW.horas
            ELSE 0
        END,
        updated_at = NOW()
    WHERE employee_id = NEW.employee_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_time_bank
    AFTER INSERT ON public.time_bank_entries
    FOR EACH ROW EXECUTE FUNCTION public.sync_time_bank_balance();

-- ============================================================
-- FUNÇÃO: incrementar scan_count ao usar QR
-- ============================================================

CREATE OR REPLACE FUNCTION public.qr_checkin(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_qr public.qr_codes_obra;
BEGIN
    SELECT * INTO v_qr FROM public.qr_codes_obra
    WHERE token = p_token AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW());

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'QR inválido ou expirado');
    END IF;

    UPDATE public.qr_codes_obra SET scan_count = scan_count + 1 WHERE id = v_qr.id;

    RETURN json_build_object(
        'valid',        TRUE,
        'project_id',   v_qr.project_id,
        'project_name', v_qr.project_name,
        'label',        v_qr.label,
        'org_id',       v_qr.org_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.qr_checkin(TEXT) TO anon, authenticated;
