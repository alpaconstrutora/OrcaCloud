-- ============================================================================
-- Documentos › Ofícios — F9: FONTE LIVRE nos modelos (10/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F9 — pedido de
-- 10/10: "PDF/A, saída em DOCX e fonte livre nos modelos").
--
-- Até aqui o modelo só tinha a Roboto (embutida no pdfmake). Agora a
-- organização envia as próprias fontes (.ttf/.otf — regular e, se houver,
-- negrito, itálico e negrito itálico) e o modelo escolhe entre a Roboto e elas.
-- O PDF EMBUTE a fonte (exigência do PDF/A-2b, que a F8 ligou).
--
--   • `doc_gen_fontes` — o cadastro: nome da família (o que aparece no select e
--     no Word) e os caminhos de cada variação no bucket privado `doc-gen-assets`
--     (`<organization_id>/fontes/<id>/<variacao>.<ttf|otf>` — a 1ª pasta é a
--     organização, como as policies do bucket já exigem).
--   • O bucket passa a aceitar `font/ttf` e `font/otf` além das imagens
--     (o limite de 5 MB continua).
--
-- A licença de uso da fonte é de quem envia — a tela avisa. Apagar a fonte não
-- apaga PDF já emitido (a fonte vai embutida nele); o modelo que a usava volta
-- a pedir uma fonte.
--
-- RLS: membro da organização (sem OR solto — REGRA #7). Nenhuma função nova.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.doc_gen_fontes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome             TEXT NOT NULL CHECK (btrim(nome) <> '' AND lower(btrim(nome)) <> 'roboto'),
    -- { "normal": "<caminho>", "bold": "<caminho>"?, "italics": "<caminho>"?, "bolditalics": "<caminho>"? }
    arquivos         JSONB NOT NULL CHECK (arquivos ? 'normal'),
    created_by       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, nome)
);
COMMENT ON TABLE public.doc_gen_fontes IS
  'Fontes da organização para os modelos de documento (Ofícios). Arquivos no bucket privado doc-gen-assets; o PDF as embute.';

ALTER TABLE public.doc_gen_fontes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_fontes_select ON public.doc_gen_fontes;
CREATE POLICY doc_gen_fontes_select ON public.doc_gen_fontes
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_fontes_insert ON public.doc_gen_fontes;
CREATE POLICY doc_gen_fontes_insert ON public.doc_gen_fontes
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_fontes_update ON public.doc_gen_fontes;
CREATE POLICY doc_gen_fontes_update ON public.doc_gen_fontes
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_fontes_delete ON public.doc_gen_fontes;
CREATE POLICY doc_gen_fontes_delete ON public.doc_gen_fontes
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

-- O bucket passa a aceitar os arquivos de fonte.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'font/ttf', 'font/otf']
 WHERE id = 'doc-gen-assets';
