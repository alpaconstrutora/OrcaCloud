-- ============================================================================
-- Documentos › Ofícios — F2: o documento (rascunho) e o histórico de versões
-- (08/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F2)
--
-- O que nasce aqui, e por quê:
--
--   • `doc_gen_documentos` — um ofício. Nasce RASCUNHO e SEM número: o número
--     só é reservado na emissão (F3), para não abrir buracos na sequência.
--     Guarda o que o usuário decidiu, não o que o sistema calcula:
--       - `destinatario_snapshot`: o destinatário normalizado no momento da
--         escolha (o cadastro pode mudar depois; o ofício não);
--       - `valores`: só os campos preenchidos "só neste documento" (overrides);
--         o resto é resolvido do cadastro na hora da prévia/emissão;
--       - `conteudo`: o texto de cada campo livre do modelo ({nome: doc TipTap});
--       - `signatarios`, `anexos`: listas JSON (snapshot de quem assina; nome
--         e, quando houver, o documento do GED de cada anexo).
--     `data_documento` NULL = data automática (a da emissão).
--
--   • `doc_gen_documento_versoes` — cada "Salvar" guarda o rascunho inteiro
--     (`snapshot`). Na emissão (F3) a última é marcada `congelada`.
--
--   • O modelo usado não pode ser apagado enquanto houver ofício dele
--     (FK RESTRICT): sem o modelo o rascunho não tem mais o texto-base.
--
-- RLS: `is_org_member(organization_id)` em tudo. Apagar só RASCUNHO (o AND
-- na policy não abre nada: as duas pernas precisam valer). REGRA #7: nenhuma
-- função SECURITY DEFINER nesta migration.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. O documento ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_documentos (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Empresa do grupo que emite (opcional: sem ela, a própria organização).
    company_id               UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    modelo_id                UUID NOT NULL REFERENCES public.doc_gen_modelos(id) ON DELETE RESTRICT,
    modelo_versao            INTEGER NOT NULL,
    tipo_documental          TEXT NOT NULL DEFAULT 'OFICIO' CHECK (tipo_documental IN ('OFICIO')),
    -- Fase 2 da proposta acrescenta EM_APROVACAO/APROVADO/ASSINADO/ENVIADO/
    -- RECEBIDO/RESPONDIDO/ENCERRADO; até lá, só o que existe de verdade.
    status                   TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'EMITIDO', 'CANCELADO')),
    numero                   TEXT,
    assunto                  TEXT NOT NULL DEFAULT '',
    data_documento           DATE,
    -- Cidade do "Local e data"; NULL = a da empresa emitente.
    cidade                   TEXT,
    department_id            UUID REFERENCES public.company_departments(id) ON DELETE SET NULL,
    destinatario_tipo        TEXT CHECK (destinatario_tipo IN ('CLIENTE', 'FORNECEDOR', 'ORGANIZACAO', 'COLABORADOR', 'CORRETOR', 'INVESTIDOR', 'MANUAL')),
    destinatario_id          UUID,
    destinatario_snapshot    JSONB,
    project_id               UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    empreendimento_id        UUID REFERENCES public.empreendimentos(id) ON DELETE SET NULL,
    contract_id              UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    client_id                UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    supplier_id              UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    valores                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    conteudo                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    signatarios              JSONB NOT NULL DEFAULT '[]'::jsonb,
    anexos                   JSONB NOT NULL DEFAULT '[]'::jsonb,
    documento_relacionado_id UUID REFERENCES public.doc_gen_documentos(id) ON DELETE SET NULL,
    resposta_esperada_ate    DATE,
    versao                   INTEGER NOT NULL DEFAULT 1,
    -- Preenchidos na emissão (F3).
    ged_document_id          UUID REFERENCES public.opura_documents(id) ON DELETE SET NULL,
    ged_version_id           UUID,
    emitido_por              TEXT,
    emitido_em               TIMESTAMPTZ,
    created_by               TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT doc_gen_documentos_destinatario_coerente CHECK (
        destinatario_tipo IS NULL OR destinatario_tipo = 'MANUAL' OR destinatario_id IS NOT NULL
    )
);

COMMENT ON TABLE public.doc_gen_documentos IS
  'Documentos gerados pelo motor (Documentos › Ofícios). Nasce RASCUNHO sem número; número só na emissão (F3). '
  'valores = só overrides "só neste documento"; o resto resolve do cadastro. Plano: docs/planos/2026-10-07-gerador-de-oficios.md.';

-- Número único por organização e tipo — só os emitidos têm número.
CREATE UNIQUE INDEX IF NOT EXISTS doc_gen_documentos_numero_key
    ON public.doc_gen_documentos(organization_id, tipo_documental, numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_gen_documentos_org_idx
    ON public.doc_gen_documentos(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS doc_gen_documentos_modelo_idx
    ON public.doc_gen_documentos(modelo_id);

ALTER TABLE public.doc_gen_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_documentos_select ON public.doc_gen_documentos;
CREATE POLICY doc_gen_documentos_select ON public.doc_gen_documentos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_documentos_insert ON public.doc_gen_documentos;
CREATE POLICY doc_gen_documentos_insert ON public.doc_gen_documentos
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_documentos_update ON public.doc_gen_documentos;
CREATE POLICY doc_gen_documentos_update ON public.doc_gen_documentos
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_documentos_delete ON public.doc_gen_documentos;
CREATE POLICY doc_gen_documentos_delete ON public.doc_gen_documentos
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id) AND status = 'RASCUNHO');

DROP TRIGGER IF EXISTS trg_doc_gen_documentos_updated_at ON public.doc_gen_documentos;
CREATE TRIGGER trg_doc_gen_documentos_updated_at
    BEFORE UPDATE ON public.doc_gen_documentos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Versões do documento ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_documento_versoes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id     UUID NOT NULL REFERENCES public.doc_gen_documentos(id) ON DELETE CASCADE,
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    versao           INTEGER NOT NULL,
    snapshot         JSONB NOT NULL,
    autor            TEXT,
    congelada        BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (documento_id, versao)
);

COMMENT ON TABLE public.doc_gen_documento_versoes IS
  'Histórico do documento: cada gravação guarda o rascunho inteiro. A emitida (F3) fica congelada. Sem UPDATE/DELETE por policy.';

CREATE INDEX IF NOT EXISTS doc_gen_documento_versoes_doc_idx
    ON public.doc_gen_documento_versoes(documento_id, versao DESC);

ALTER TABLE public.doc_gen_documento_versoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_documento_versoes_select ON public.doc_gen_documento_versoes;
CREATE POLICY doc_gen_documento_versoes_select ON public.doc_gen_documento_versoes
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_documento_versoes_insert ON public.doc_gen_documento_versoes;
CREATE POLICY doc_gen_documento_versoes_insert ON public.doc_gen_documento_versoes
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
