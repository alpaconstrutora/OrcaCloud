-- ============================================================================
-- Documentos › Ofícios — F6: BIBLIOTECA DE BLOCOS (10/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F6 — Fase 3 da
-- proposta: "biblioteca de blocos").
--
-- Trechos prontos da organização (fecho padrão, cláusula de prazo, parágrafo
-- de encaminhamento…) que se inserem no editor do modelo ou na redação do
-- ofício. `conteudo` é um documento TipTap (o mesmo JSON do editor; pode ter
-- variáveis, condições e tabelas dinâmicas). Inserir COPIA o trecho: mudar o
-- bloco depois não mexe em modelo nem ofício que já o usaram.
--
-- RLS: membro da organização em tudo (sem OR solto — REGRA #7). Nenhuma função.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.doc_gen_blocos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome             TEXT NOT NULL CHECK (btrim(nome) <> ''),
    descricao        TEXT,
    conteudo         JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
    created_by       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.doc_gen_blocos IS
  'Biblioteca de trechos prontos (TipTap JSON) da organização para os modelos e ofícios. Inserir copia o trecho.';

CREATE INDEX IF NOT EXISTS doc_gen_blocos_org_idx ON public.doc_gen_blocos(organization_id, nome);

ALTER TABLE public.doc_gen_blocos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_blocos_select ON public.doc_gen_blocos;
CREATE POLICY doc_gen_blocos_select ON public.doc_gen_blocos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_blocos_insert ON public.doc_gen_blocos;
CREATE POLICY doc_gen_blocos_insert ON public.doc_gen_blocos
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_blocos_update ON public.doc_gen_blocos;
CREATE POLICY doc_gen_blocos_update ON public.doc_gen_blocos
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_blocos_delete ON public.doc_gen_blocos;
CREATE POLICY doc_gen_blocos_delete ON public.doc_gen_blocos
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_doc_gen_blocos_updated_at ON public.doc_gen_blocos;
CREATE TRIGGER trg_doc_gen_blocos_updated_at
    BEFORE UPDATE ON public.doc_gen_blocos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
