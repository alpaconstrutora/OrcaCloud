-- ============================================================
-- Migration: aplicar_20271004000010_cdv_source_sistema.sql
-- Contratos › Emissão — o "PDF do sistema" (gerado sem modelo, layout fixo do
-- exportService) passa a virar VERSÃO em contract_document_versions.
-- Plano: docs/planos/2026-10-04-gerar-pelo-modelo-versao-pdf.md
--
-- A coluna `source` só aceitava UPLOAD | TEMPLATE_DOCX | TEMPLATE_HTML. Gravar o
-- PDF do sistema como uma dessas mentiria sobre a origem do arquivo, então entra
-- um valor próprio: SISTEMA. Nenhuma linha existente muda.
--
-- Idempotente: DROP ... IF EXISTS + ADD com o conjunto completo.
-- Autorizado pelo usuário em 2026-10-04 ("Sim, aplicar a migration").
-- ============================================================

ALTER TABLE public.contract_document_versions
    DROP CONSTRAINT IF EXISTS contract_document_versions_source_check;

ALTER TABLE public.contract_document_versions
    ADD CONSTRAINT contract_document_versions_source_check
    CHECK (source = ANY (ARRAY['UPLOAD', 'TEMPLATE_DOCX', 'TEMPLATE_HTML', 'SISTEMA']::text[]));

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
      FROM pg_constraint
     WHERE conrelid = 'public.contract_document_versions'::regclass
       AND conname = 'contract_document_versions_source_check';
    IF v_def IS NULL OR v_def NOT LIKE '%SISTEMA%' OR v_def NOT LIKE '%TEMPLATE_HTML%' THEN
        RAISE EXCEPTION 'source_check não ficou com os 4 valores: %', v_def;
    END IF;
    RAISE NOTICE 'OK: %', v_def;
END $$;
