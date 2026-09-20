-- ============================================================================
-- Planta Inteligente — STATUS DO CONFLITO: aceite com justificativa (20/09/2026, P2.1)
--
-- Backlog P2 do roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`
-- ("status do conflito"). A lista de conflitos continua DERIVADA e verdadeira:
-- o que se grava aqui é a DECISÃO sobre um par de peças — "este pilar dentro
-- do shaft é aceito porque o shaft será refeito na etapa 2" —, por (estudo,
-- par de uids). A lista some quando o desenho muda; a decisão fica para quando
-- o mesmo par voltar. Se o encontro CRESCER além do aceito, a tela volta a
-- contá-lo como aberto (regra pura em `utils/blueprintConflitoStatus.ts`).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_conflict_acceptances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL REFERENCES public.blueprint_studies(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- `<uid da peça>:<uid do outro>` — a mesma identidade do tópico BCF (`clash:…`).
    chave           TEXT NOT NULL CHECK (length(chave) BETWEEN 3 AND 200),
    classe          TEXT NOT NULL CHECK (length(classe) BETWEEN 2 AND 40),
    -- A medida do encontro no momento do aceite (mm) — para acusar quando crescer.
    medida_mm       INTEGER NOT NULL DEFAULT 0 CHECK (medida_mm >= 0),
    justificativa   TEXT NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 3 AND 500),
    accepted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_email  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_conflict_acceptances_unica UNIQUE (study_id, chave)
);

COMMENT ON TABLE public.blueprint_conflict_acceptances IS
  'Planta Inteligente: conflito ACEITO com justificativa, por (estudo, par de uids). A lista de conflitos continua derivada; isto é a decisão sobre o par.';

CREATE INDEX IF NOT EXISTS blueprint_conflict_acceptances_study_idx ON public.blueprint_conflict_acceptances(study_id);

ALTER TABLE public.blueprint_conflict_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_conflict_acceptances_org" ON public.blueprint_conflict_acceptances;
CREATE POLICY "blueprint_conflict_acceptances_org"
    ON public.blueprint_conflict_acceptances
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
-- LEITOR do estudo (E10.1) não aceita nem reabre: decisão de projeto é de quem edita.
-- (três policies, e não FOR ALL: o leitor continua VENDO os aceites — só não decide.)
DROP POLICY IF EXISTS "blueprint_conflict_acceptances_leitor_nao_aceita" ON public.blueprint_conflict_acceptances;
CREATE POLICY "blueprint_conflict_acceptances_leitor_nao_aceita"
    ON public.blueprint_conflict_acceptances
    AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (NOT public.fn_blueprint_e_leitor(study_id));
DROP POLICY IF EXISTS "blueprint_conflict_acceptances_leitor_nao_altera" ON public.blueprint_conflict_acceptances;
CREATE POLICY "blueprint_conflict_acceptances_leitor_nao_altera"
    ON public.blueprint_conflict_acceptances
    AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (NOT public.fn_blueprint_e_leitor(study_id))
    WITH CHECK (NOT public.fn_blueprint_e_leitor(study_id));
DROP POLICY IF EXISTS "blueprint_conflict_acceptances_leitor_nao_reabre" ON public.blueprint_conflict_acceptances;
CREATE POLICY "blueprint_conflict_acceptances_leitor_nao_reabre"
    ON public.blueprint_conflict_acceptances
    AS RESTRICTIVE
    FOR DELETE TO authenticated
    USING (NOT public.fn_blueprint_e_leitor(study_id));
REVOKE ALL ON public.blueprint_conflict_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_conflict_acceptances TO authenticated;
