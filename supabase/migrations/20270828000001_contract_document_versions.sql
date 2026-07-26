-- ============================================================
-- Versões de documento de CONTRATO e de ADITIVO.
--
-- Substitui `contracts.minuta_versions` (JSONB) como fonte da verdade. O JSONB
-- PERMANECE, mas vira projeção read-only mantida por
-- contractDocumentVersionService._syncMinutaMirror — o Portal do Cliente lê
-- dele (components/ClientArea.tsx:1110). Escritor único = sem drift.
--
-- Owner polimórfico (CONTRACT | ADDENDUM), SEM FK — mesmo motivo documentado em
-- 20270827000001: FK em `contracts` exige ShareRowExclusiveLock nas duas pontas
-- e já deadlockou. `contract_id` é denormalizado e SEMPRE preenchido (para
-- versão de aditivo, é o contrato do aditivo): é ele que dá RLS barata e
-- permite listar "contrato + seus aditivos" numa query só.
-- ============================================================

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.contract_document_versions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid,
    contract_id            uuid NOT NULL,
    owner_type             text NOT NULL CHECK (owner_type IN ('CONTRACT', 'ADDENDUM')),
    owner_id               uuid NOT NULL,
    v                      integer NOT NULL,
    kind                   text NOT NULL DEFAULT 'MINUTA'
                             CHECK (kind IN ('MINUTA', 'CONTRATO', 'ADITIVO', 'ANEXO')),
    name                   text,
    notes                  text,
    url                    text NOT NULL,
    storage_path           text,
    mime_type              text,
    size_bytes             bigint,
    source                 text DEFAULT 'UPLOAD'
                             CHECK (source IN ('UPLOAD', 'TEMPLATE_DOCX', 'TEMPLATE_HTML')),
    template_id            uuid,
    emitted                boolean NOT NULL DEFAULT false,
    emitted_at             timestamptz,
    signature_status       text CHECK (signature_status IS NULL OR signature_status IN
                             ('PENDING', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED')),
    signature_token        text,
    signature_url          text,
    signature_completed_at timestamptz,
    signed_file_url        text,
    created_by             text,
    created_at             timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at             timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.contract_document_versions IS
 'Versões de documento de contrato e de aditivo (minuta, contrato, aditivo, anexo), com emissão ao portal e assinatura por versão.';
COMMENT ON COLUMN public.contract_document_versions.owner_id IS
 'Contrato OU aditivo, conforme owner_type. SEM FK de propósito (DDL com FK em contracts deadlocka); integridade na aplicação + limpeza explícita em contractService.deleteContract.';
COMMENT ON COLUMN public.contract_document_versions.contract_id IS
 'Contrato raiz — para versão de aditivo é o contrato do aditivo. Sempre preenchido: é a chave da RLS e da listagem da aba Documentos & Assinatura.';
COMMENT ON COLUMN public.contract_document_versions.emitted IS
 'true = liberada ao Portal do Cliente. Versões legadas de minuta_versions sem o campo contam como emitidas (semântica preservada no backfill).';
COMMENT ON COLUMN public.contract_document_versions.storage_path IS
 'Caminho no bucket, gravado desde já para a migração de URL pública -> signed URL (PLANO_STORAGE_PRIVATIZACAO.md).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cdv_owner_v
    ON public.contract_document_versions (owner_type, owner_id, v);
CREATE INDEX IF NOT EXISTS ix_cdv_contract
    ON public.contract_document_versions (contract_id, created_at DESC);
-- O webhook do ZapSign casa por token: precisa ser único e indexado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cdv_signature_token
    ON public.contract_document_versions (signature_token)
    WHERE signature_token IS NOT NULL;

ALTER TABLE public.contract_document_versions ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de contract_addendums (20260224000001): a RLS de `contracts` se
-- aplica dentro da subquery, então o recorte por organização é herdado dela.
DROP POLICY IF EXISTS "Users can view contract document versions" ON public.contract_document_versions;
CREATE POLICY "Users can view contract document versions"
    ON public.contract_document_versions FOR SELECT TO authenticated
    USING (contract_id IN (SELECT id FROM public.contracts));

DROP POLICY IF EXISTS "Users can manage contract document versions" ON public.contract_document_versions;
CREATE POLICY "Users can manage contract document versions"
    ON public.contract_document_versions FOR ALL TO authenticated
    USING (contract_id IN (SELECT id FROM public.contracts))
    WITH CHECK (contract_id IN (SELECT id FROM public.contracts));

RESET lock_timeout;
