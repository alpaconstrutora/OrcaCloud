-- =============================================================================
-- Migration: 20270716000005_opura_cno_documents.sql
-- Módulo: ÒPURA CNO & Previdência de Obras
-- Objetivo: Checklist documental de abertura/regularização do CNO exigido pela
--           Receita Federal (projeto aprovado, habite-se, obra com Administração
--           Pública, identificação e documentos de representação). Cada item
--           aponta para um documento do ÒPURA Docs (opura_documents) OU recebe
--           upload direto — que também vai parar no DMS. Recria, no schema
--           canônico opura_cno_*, a parte de documentos que a consolidação
--           havia perdido ao aposentar construction_social_security_documents.
--
-- Nota anon: esta migration é POSTERIOR ao rollout drop-anon
--            (20270208000002); por isso NÃO cria policy `anon` — só a de
--            authenticated escopada por organização.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA DE DOMÍNIO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opura_cno_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cno_registration_id UUID NOT NULL REFERENCES public.opura_cno_registrations(id) ON DELETE CASCADE,
    -- Bloco da exigência da Receita: obra, obra com Administração Pública,
    -- identificação (pessoa) e representação (procuração/tutela/inventário/PJ).
    bloco               VARCHAR(40) NOT NULL
                        CONSTRAINT chk_cno_doc_bloco
                        CHECK (bloco IN ('obra', 'administracao_publica', 'identificacao', 'representacao')),
    tipo_documento      VARCHAR(60) NOT NULL,   -- 'projeto_aprovado', 'habite_se', 'rg', 'procuracao', ...
    titulo              VARCHAR(200) NOT NULL,
    referente_a         VARCHAR(200),           -- nome da pessoa/PJ (blocos identificacao/representacao)
    -- Ponte para o DMS. SEM REFERENCES de propósito: documentService.listDocuments
    -- devolve também documentos sintéticos (is_integrated) cujo id não existe em
    -- opura_documents — mesmo precedente de process_instance_steps.document_id.
    document_id         UUID,
    storage_path        TEXT,                   -- denormalizado no momento do vínculo/upload (download sem novo fetch)
    numero              VARCHAR(100),
    data_emissao        DATE,
    data_validade       DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CONSTRAINT chk_cno_doc_status
                        CHECK (status IN ('pendente', 'anexado', 'vencido', 'dispensado')),
    obrigatorio         BOOLEAN NOT NULL DEFAULT FALSE,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY (só authenticated, escopo por organização)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_cno_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cno_documents_org_access" ON public.opura_cno_documents;
CREATE POLICY "cno_documents_org_access" ON public.opura_cno_documents
FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cno_documents_registration
    ON public.opura_cno_documents(cno_registration_id);
CREATE INDEX IF NOT EXISTS idx_cno_documents_org_reg
    ON public.opura_cno_documents(organization_id, cno_registration_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER (Auto updated_at) — reutiliza função existente do módulo
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cno_documents_updated_at ON public.opura_cno_documents;
CREATE TRIGGER trg_cno_documents_updated_at
    BEFORE UPDATE ON public.opura_cno_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_opura_cno_updated_at();
