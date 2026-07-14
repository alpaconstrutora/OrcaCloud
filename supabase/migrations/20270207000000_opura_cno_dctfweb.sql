-- =============================================================================
-- Migration: 20270207000000_opura_cno_dctfweb.sql
-- Módulo: ÒPURA CNO & Previdência de Obras
-- Objetivo: Controle de DCTFWeb / DARF vinculado ao cadastro de CNO.
--           Portado do módulo antigo (construction_social_security_dctfweb),
--           consolidando a funcionalidade no schema canônico opura_cno_*.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA DE DOMÍNIO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opura_cno_dctfweb (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cno_registration_id UUID NOT NULL REFERENCES public.opura_cno_registrations(id) ON DELETE CASCADE,
    declaration_number  VARCHAR(100),
    transmission_date   DATE,
    principal_amount    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fine_amount         NUMERIC(15, 2) NOT NULL DEFAULT 0,
    interest_amount     NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status              VARCHAR(50) DEFAULT 'transmitida'
                        CONSTRAINT chk_dctfweb_status CHECK (status IN ('transmitida', 'retificada', 'paga', 'cancelada')),
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_cno_dctfweb ENABLE ROW LEVEL SECURITY;

-- 2.1 Produção (autenticados) — escopo por organização
DROP POLICY IF EXISTS "cno_dctfweb_org_access" ON public.opura_cno_dctfweb;
CREATE POLICY "cno_dctfweb_org_access" ON public.opura_cno_dctfweb
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- 2.2 Dev (anon) — mesmo padrão das demais tabelas opura_cno_*
DROP POLICY IF EXISTS "Allow anon all on opura_cno_dctfweb" ON public.opura_cno_dctfweb;
CREATE POLICY "Allow anon all on opura_cno_dctfweb"
ON public.opura_cno_dctfweb FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cno_dctfweb_org_reg
    ON public.opura_cno_dctfweb(organization_id, cno_registration_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER (Auto updated_at) — reutiliza função existente do módulo
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cno_dctfweb_updated_at ON public.opura_cno_dctfweb;
CREATE TRIGGER trg_cno_dctfweb_updated_at
    BEFORE UPDATE ON public.opura_cno_dctfweb
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();
