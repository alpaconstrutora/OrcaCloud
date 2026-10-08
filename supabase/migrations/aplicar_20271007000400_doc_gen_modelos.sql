-- ============================================================================
-- Documentos › Ofícios — F1: modelos do motor de documentos parametrizados
-- (07/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md
--
-- O que nasce aqui, e por quê:
--
--   • `doc_gen_modelos` — o modelo é um documento TipTap (JSONB) com nós de
--     variável ({{empresa.razao_social}}) e de campo livre, mais um `layout`
--     (cabeçalho, rodapé, logo, fonte, margens). O prefixo `doc_gen_` é de
--     propósito genérico: o Ofício é só o primeiro `tipo_documental`.
--
--   • `doc_gen_modelo_versoes` — toda gravação do modelo sobe `versao` e deixa
--     a cópia anterior aqui. Sem UPDATE/DELETE: histórico é só leitura.
--
--   • `organization_members` ganha os dados que um SIGNATÁRIO precisa (cargo,
--     departamento, telefone, registro profissional, imagem da assinatura).
--     Decisão do usuário em 07/10: o signatário É o usuário de Minha
--     Organização › Usuários — não um cadastro paralelo. O "cargo customizado"
--     que a tela já tinha é template de permissões, não cargo funcional.
--
--   • Bucket privado `doc-gen-assets` para a imagem da assinatura. Primeira
--     pasta do caminho = organization_id, como os demais buckets privados.
--
-- RLS: `is_org_member(organization_id)` em tudo, sem perna OR solta (REGRA #7).
-- Nenhuma função SECURITY DEFINER nasce nesta migration.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Modelos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_modelos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome                  TEXT NOT NULL,
    descricao             TEXT,
    tipo_documental       TEXT NOT NULL DEFAULT 'OFICIO'
                          CHECK (tipo_documental IN ('OFICIO')),
    -- Uma das 5 categorias do GED (CHECK de opura_documents.categoria). O PDF
    -- emitido é arquivado nessa categoria; não existe categoria "ofício".
    categoria_ged         TEXT NOT NULL DEFAULT 'juridico'
                          CHECK (categoria_ged IN ('juridico', 'engenharia', 'compliance', 'financeiro', 'comercial')),
    department_id         UUID REFERENCES public.company_departments(id) ON DELETE SET NULL,
    status                TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho', 'ativo', 'inativo')),
    -- Documento TipTap: {"type":"doc","content":[...]} com nós `variavel`,
    -- `campoLivre`, `assinaturas`, `anexos` além dos nós padrão do editor.
    conteudo              JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    -- Cabeçalho, rodapé, logo, fonte, tamanho, margens (mm), espaçamento,
    -- paginação. Forma em types/docGen.ts (LayoutModelo).
    layout                JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Chaves de variável que precisam estar preenchidas para emitir
    -- (ex.: 'destinatario.cpf_cnpj').
    campos_obrigatorios   TEXT[] NOT NULL DEFAULT '{}'::text[],
    signatario_member_id  UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
    responsavel_email     TEXT,
    versao                INTEGER NOT NULL DEFAULT 1,
    created_by            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.doc_gen_modelos IS
  'Modelos do motor de documentos parametrizados (Documentos › Ofícios › Modelos). '
  'conteudo = JSON do TipTap com nós variavel/campoLivre; layout = cabeçalho/rodapé/margens. '
  'Plano: docs/planos/2026-10-07-gerador-de-oficios.md.';

CREATE INDEX IF NOT EXISTS doc_gen_modelos_org_idx
    ON public.doc_gen_modelos(organization_id, status, nome);

ALTER TABLE public.doc_gen_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_modelos_select ON public.doc_gen_modelos;
CREATE POLICY doc_gen_modelos_select ON public.doc_gen_modelos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_modelos_insert ON public.doc_gen_modelos;
CREATE POLICY doc_gen_modelos_insert ON public.doc_gen_modelos
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_modelos_update ON public.doc_gen_modelos;
CREATE POLICY doc_gen_modelos_update ON public.doc_gen_modelos
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_modelos_delete ON public.doc_gen_modelos;
CREATE POLICY doc_gen_modelos_delete ON public.doc_gen_modelos
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_doc_gen_modelos_updated_at ON public.doc_gen_modelos;
CREATE TRIGGER trg_doc_gen_modelos_updated_at
    BEFORE UPDATE ON public.doc_gen_modelos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Versões do modelo (histórico só leitura) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_modelo_versoes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo_id        UUID NOT NULL REFERENCES public.doc_gen_modelos(id) ON DELETE CASCADE,
    -- Denormalizado de propósito: a RLS lê daqui sem join.
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    versao           INTEGER NOT NULL,
    conteudo         JSONB NOT NULL,
    layout           JSONB NOT NULL,
    created_by       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (modelo_id, versao)
);

COMMENT ON TABLE public.doc_gen_modelo_versoes IS
  'Cópia do modelo a cada gravação (versao = a que ficou para trás). Sem UPDATE/DELETE por policy.';

ALTER TABLE public.doc_gen_modelo_versoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_gen_modelo_versoes_select ON public.doc_gen_modelo_versoes;
CREATE POLICY doc_gen_modelo_versoes_select ON public.doc_gen_modelo_versoes
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_modelo_versoes_insert ON public.doc_gen_modelo_versoes;
CREATE POLICY doc_gen_modelo_versoes_insert ON public.doc_gen_modelo_versoes
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

-- ── 3. Signatário = usuário da organização ──────────────────────────────────
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES public.company_departments(id) ON DELETE SET NULL;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS registro_profissional TEXT;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS assinatura_path TEXT;

COMMENT ON COLUMN public.organization_members.cargo IS
  'Cargo funcional do usuário, impresso em documentos gerados (Ofícios). Não confundir com custom_role_id (template de permissões).';
COMMENT ON COLUMN public.organization_members.registro_profissional IS
  'CREA/CAU/OAB etc., impresso no bloco de assinatura dos documentos gerados.';
COMMENT ON COLUMN public.organization_members.assinatura_path IS
  'Caminho da imagem da assinatura no bucket privado doc-gen-assets (<organization_id>/assinaturas/<member_id>.<ext>).';

-- ── 4. Bucket privado para a imagem da assinatura ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'doc-gen-assets',
    'doc-gen-assets',
    false,
    5242880,   -- 5 MB
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Primeira pasta do caminho = organization_id; vale para quem é membro
-- (por user_id OU e-mail — memória project_rls_user_id_vs_email_organization_members).
DROP POLICY IF EXISTS "Org members read doc-gen assets" ON storage.objects;
CREATE POLICY "Org members read doc-gen assets" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'doc-gen-assets'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM public.organization_members
            WHERE user_id = auth.uid() OR email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members upload doc-gen assets" ON storage.objects;
CREATE POLICY "Org members upload doc-gen assets" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'doc-gen-assets'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM public.organization_members
            WHERE user_id = auth.uid() OR email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members update doc-gen assets" ON storage.objects;
CREATE POLICY "Org members update doc-gen assets" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'doc-gen-assets'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM public.organization_members
            WHERE user_id = auth.uid() OR email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members delete doc-gen assets" ON storage.objects;
CREATE POLICY "Org members delete doc-gen assets" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'doc-gen-assets'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM public.organization_members
            WHERE user_id = auth.uid() OR email = auth.jwt()->>'email'
        )
    );
