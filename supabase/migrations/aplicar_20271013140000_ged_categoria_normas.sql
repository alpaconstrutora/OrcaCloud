-- ============================================================================
-- GED — categoria "normas" (ABNT e similares) + metadados de norma (13/10/2026)
--
-- Plano: docs/planos/2026-10-13-ged-aba-normas.md
--
-- 1. `categoria` de opura_documents e opura_folders é travada por CHECK
--    (nomes conferidos no remoto em 13/10/2026). Sem 'normas' na lista, o
--    upload e a criação de pasta na aba nova falhariam no INSERT.
-- 2. Norma não "vence" por data: é cancelada ou substituída por outra edição.
--    Por isso os campos próprios (órgão, código, edição, situação,
--    substituída por) — a tabela não tem coluna JSONB de metadados.
--    Todos nullable: só documentos da categoria 'normas' os preenchem.
--
-- Sem policy nem função nova — a RLS existente de opura_documents vale para
-- as colunas novas. Idempotente (DROP/ADD IF [NOT] EXISTS).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado).
-- ============================================================================

ALTER TABLE public.opura_documents DROP CONSTRAINT IF EXISTS opura_documents_categoria_check;
ALTER TABLE public.opura_documents ADD CONSTRAINT opura_documents_categoria_check
  CHECK (categoria IN ('juridico', 'engenharia', 'compliance', 'financeiro', 'comercial', 'normas'));

ALTER TABLE public.opura_folders DROP CONSTRAINT IF EXISTS opura_folders_categoria_check;
ALTER TABLE public.opura_folders ADD CONSTRAINT opura_folders_categoria_check
  CHECK (categoria IN ('juridico', 'engenharia', 'compliance', 'financeiro', 'comercial', 'normas'));

ALTER TABLE public.opura_documents
  ADD COLUMN IF NOT EXISTS norma_orgao TEXT,
  ADD COLUMN IF NOT EXISTS norma_codigo TEXT,
  ADD COLUMN IF NOT EXISTS norma_edicao TEXT,
  ADD COLUMN IF NOT EXISTS norma_situacao TEXT,
  ADD COLUMN IF NOT EXISTS norma_substituida_por TEXT;

ALTER TABLE public.opura_documents DROP CONSTRAINT IF EXISTS opura_documents_norma_situacao_check;
ALTER TABLE public.opura_documents ADD CONSTRAINT opura_documents_norma_situacao_check
  CHECK (norma_situacao IS NULL OR norma_situacao IN ('em_vigor', 'cancelada', 'substituida'));

COMMENT ON COLUMN public.opura_documents.norma_orgao IS 'Órgão emissor da norma (ABNT, ISO, NR/MTE, IT Bombeiros...). Só categoria = normas.';
COMMENT ON COLUMN public.opura_documents.norma_codigo IS 'Código da norma, ex.: NBR 15575-1. Só categoria = normas.';
COMMENT ON COLUMN public.opura_documents.norma_edicao IS 'Edição/ano, ex.: 2024 ou "2013 Versão corrigida 2021". Só categoria = normas.';
COMMENT ON COLUMN public.opura_documents.norma_situacao IS 'em_vigor | cancelada | substituida. Norma não vence por data. Só categoria = normas.';
COMMENT ON COLUMN public.opura_documents.norma_substituida_por IS 'Referência da norma que a substitui (texto livre). Só categoria = normas.';
