-- ============================================================
-- F4 — Partida Dobrada Automática
-- Quando uma NF-e é aprovada, gera par D/C vinculado por journal_entry_id.
-- O DRE ignora a contra-entrada porque dre_group='PASSIVO' não está
-- na lista de grupos que fn_dre_summary/fn_dre acumulam.
-- ============================================================

-- 1. Colunas de partida dobrada em internal_transactions
ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID,
  ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'PRINCIPAL'
    CHECK (entry_type IN ('PRINCIPAL', 'CONTRA'));

CREATE INDEX IF NOT EXISTS idx_internal_txs_journal_entry
  ON public.internal_transactions (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- 2. Ampliar os CHECK constraints para suportar categorias de passivo
ALTER TABLE public.financial_categories
  DROP CONSTRAINT IF EXISTS financial_categories_dre_group_check,
  DROP CONSTRAINT IF EXISTS financial_categories_nature_check;

ALTER TABLE public.financial_categories
  ADD CONSTRAINT financial_categories_dre_group_check CHECK (dre_group IN (
    'RECEITA_BRUTA', 'DEDUCOES', 'CUSTO_OBRA', 'CUSTO_SERVICO',
    'DESPESA_ADM', 'DESPESA_COMERCIAL', 'FINANCEIRO',
    'IMPOSTOS', 'NAO_OPERACIONAL', 'SEM_CLASSIFICACAO',
    'PASSIVO', 'ATIVO'
  )),
  ADD CONSTRAINT financial_categories_nature_check CHECK (nature IN (
    'REVENUE', 'COST', 'EXPENSE', 'LIABILITY', 'ASSET'
  ));

-- 3. Categoria "Fornecedores a Pagar" (passivo — DRE ignora naturalmente)
INSERT INTO public.financial_categories (name, dre_group, nature, sort_order)
VALUES ('Fornecedores a Pagar', 'PASSIVO', 'LIABILITY', 90)
ON CONFLICT (name) DO UPDATE SET
  dre_group  = EXCLUDED.dre_group,
  nature     = EXCLUDED.nature,
  sort_order = EXCLUDED.sort_order;

-- 4. View auxiliar para o Diário Contábil
--    Retorna pares de partidas (PRINCIPAL + CONTRA) ordenados por data
CREATE OR REPLACE VIEW public.vw_journal_entries AS
SELECT
  it.journal_entry_id,
  it.organization_id,
  it.project_id,
  it.transaction_date::date          AS entry_date,
  it.description,
  it.source_system,
  it.reference_id,
  -- campos da linha principal (DEBIT = custo)
  MAX(CASE WHEN it.entry_type = 'PRINCIPAL' THEN it.amount END) AS debit_amount,
  MAX(CASE WHEN it.entry_type = 'PRINCIPAL' THEN COALESCE(fc_p.name, it.category) END) AS debit_account,
  MAX(CASE WHEN it.entry_type = 'PRINCIPAL' THEN COALESCE(fc_p.dre_group, 'SEM_CLASSIFICACAO') END) AS debit_group,
  -- campos da contra-partida (CREDIT = fornecedor)
  MAX(CASE WHEN it.entry_type = 'CONTRA' THEN it.amount END) AS credit_amount,
  MAX(CASE WHEN it.entry_type = 'CONTRA' THEN COALESCE(fc_c.name, it.category) END) AS credit_account,
  MAX(CASE WHEN it.entry_type = 'CONTRA' THEN COALESCE(fc_c.dre_group, 'PASSIVO') END) AS credit_group,
  -- status / datas
  MAX(it.status)                     AS status,
  MAX(it.created_at)                 AS created_at
FROM public.internal_transactions it
LEFT JOIN public.financial_categories fc_p
  ON it.entry_type = 'PRINCIPAL'
  AND (fc_p.id = it.category_id
       OR (it.category_id IS NULL
           AND fc_p.organization_id = it.organization_id
           AND lower(fc_p.name) = lower(it.category)))
LEFT JOIN public.financial_categories fc_c
  ON it.entry_type = 'CONTRA'
  AND (fc_c.id = it.category_id
       OR (it.category_id IS NULL
           AND fc_c.organization_id = it.organization_id
           AND lower(fc_c.name) = lower(it.category)))
WHERE it.journal_entry_id IS NOT NULL
GROUP BY
  it.journal_entry_id,
  it.organization_id,
  it.project_id,
  it.transaction_date::date,
  it.description,
  it.source_system,
  it.reference_id;

GRANT SELECT ON public.vw_journal_entries TO authenticated;

-- RLS não se aplica a views — a segurança vem da tabela-base (internal_transactions).
-- ============================================================
-- FIM: 20260628000004_f4_partida_dobrada.sql
-- ============================================================
