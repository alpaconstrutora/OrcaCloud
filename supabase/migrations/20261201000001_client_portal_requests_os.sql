-- migration: 20261201000001_client_portal_requests_os.sql
-- Portal do Cliente — Fase C
-- Tabelas: client_requests (manutenção/Locação) + client_service_orders (OS/Serviços)
-- RPCs anon: fn_portal_get_requests + fn_portal_get_service_orders

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENT_REQUESTS — chamados de manutenção (Locação)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL DEFAULT 'Geral',
        -- Elétrica | Hidráulica | Estrutural | Pintura | Serralheria | Geral | Outro
    priority        TEXT NOT NULL DEFAULT 'Média'
        CHECK (priority IN ('Baixa','Média','Alta','Urgente')),
    status          TEXT NOT NULL DEFAULT 'Aberto'
        CHECK (status IN ('Aberto','Em Andamento','Aguardando','Resolvido','Cancelado')),
    assigned_to     TEXT,
    admin_notes     TEXT,
    photos          JSONB,       -- [{url, name}]
    opened_at       DATE NOT NULL DEFAULT CURRENT_DATE,
    resolved_at     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_org    ON public.client_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_cr_client ON public.client_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_cr_status ON public.client_requests (status);

ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_client_requests" ON public.client_requests;
CREATE POLICY "org_access_client_requests" ON public.client_requests
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_cr_updated_at ON public.client_requests;
CREATE TRIGGER trg_cr_updated_at
    BEFORE UPDATE ON public.client_requests
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CLIENT_SERVICE_ORDERS — ordens de serviço (Serviços)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_service_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    number          TEXT NOT NULL,   -- ex: OS-2026-001
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'Aberta'
        CHECK (status IN ('Aberta','Em Execução','Concluída','Cancelada')),
    priority        TEXT NOT NULL DEFAULT 'Média'
        CHECK (priority IN ('Baixa','Média','Alta','Urgente')),
    scheduled_date  DATE,
    completed_date  DATE,
    assigned_to     TEXT,
    contract_id     UUID,   -- ref client's contract (sem FK para flexibilidade)
    value           NUMERIC(15,2),
    attachments     JSONB,  -- [{url, name}]
    admin_notes     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cso_org    ON public.client_service_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_cso_client ON public.client_service_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_cso_status ON public.client_service_orders (status);

ALTER TABLE public.client_service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_client_service_orders" ON public.client_service_orders;
CREATE POLICY "org_access_client_service_orders" ON public.client_service_orders
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP TRIGGER IF EXISTS trg_cso_updated_at ON public.client_service_orders;
CREATE TRIGGER trg_cso_updated_at
    BEFORE UPDATE ON public.client_service_orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPCs públicas (anon) — validam token e retornam dados do cliente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_portal_get_requests(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT json_agg(r ORDER BY r.created_at DESC)
            FROM public.client_requests r
            WHERE r.client_id = v_tok.client_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_requests(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_create_request(
    p_token       TEXT,
    p_title       TEXT,
    p_description TEXT,
    p_category    TEXT,
    p_priority    TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
    v_id  UUID;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('success', FALSE, 'error', 'Token inválido'); END IF;

    INSERT INTO public.client_requests
        (organization_id, client_id, title, description, category, priority)
    VALUES
        (v_tok.org_id, v_tok.client_id, p_title, p_description, p_category, p_priority)
    RETURNING id INTO v_id;

    RETURN json_build_object('success', TRUE, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_create_request(TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_get_service_orders(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT json_agg(o ORDER BY o.created_at DESC)
            FROM public.client_service_orders o
            WHERE o.client_id = v_tok.client_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_service_orders(TEXT) TO anon, authenticated;
