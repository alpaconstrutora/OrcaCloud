-- ==========================================================================
-- Registro de importação de extrato + saldo do banco como prova de completude
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 2.4)
-- ==========================================================================
-- PROBLEMA
-- O Dashboard de saldos calculava "saldo bancário", "saldo conciliado" e
-- "diferença" a partir de um saldo inicial que NENHUMA das 3 contas tinha
-- (`opening_balance_date` nulo em todas, medido em 05/09/2026). Somava desde 1900
-- a partir de zero: três números sem significado, apresentados como se tivessem.
--
-- Pior: não havia como saber se a importação estava COMPLETA. O OFX traz o saldo
-- de fechamento do próprio banco (`LEDGERBAL/BALAMT` com `DTASOF`), que é a
-- resposta pronta para "o que eu importei bate com o que o banco diz?". Esse campo
-- era simplesmente descartado, junto com o período do arquivo.
--
-- Esta tabela guarda o que cada arquivo trouxe. Com ela dá para responder três
-- perguntas que antes ficavam sem resposta:
--   1. o saldo calculado bate com o que o banco informou?
--   2. falta algum pedaço de extrato entre uma importação e a seguinte?
--   3. de qual arquivo veio este lançamento?
--
-- O arquivo original vai para um bucket PRIVADO, com a organização na primeira
-- pasta do caminho — é o que as policies conferem. Bucket cego à organização já
-- causou vazamento neste projeto antes (ver blueprint_underlays).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id     UUID        NOT NULL REFERENCES public.payment_accounts(id) ON DELETE CASCADE,
  file_name           TEXT        NOT NULL,
  storage_path        TEXT,
  format              TEXT        NOT NULL CHECK (format IN ('OFX','CSV','XLSX','CNAB240','CNAB400')),
  -- Cabeçalho do arquivo: o que o BANCO afirma.
  acct_id             TEXT,
  ledger_balance      NUMERIC(15,2),
  ledger_balance_date DATE,
  period_start        DATE,
  period_end          DATE,
  -- O que a importação fez.
  lines_read          INT         NOT NULL DEFAULT 0,
  lines_inserted      INT         NOT NULL DEFAULT 0,
  lines_duplicated    INT         NOT NULL DEFAULT 0,
  lines_skipped       INT         NOT NULL DEFAULT 0,
  created_by          UUID        DEFAULT auth.uid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_conta
  ON public.bank_statement_imports (bank_account_id, period_end DESC NULLS LAST, created_at DESC);

COMMENT ON TABLE public.bank_statement_imports IS
  'Um registro por arquivo de extrato importado. ledger_balance é o saldo que o BANCO informou no arquivo — a prova de que a importação está completa.';

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_statement_imports_org" ON public.bank_statement_imports;
CREATE POLICY "bank_statement_imports_org"
  ON public.bank_statement_imports
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_imports TO authenticated;

-- ── Bucket privado, recortado por organização ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- A organização é a PRIMEIRA pasta do caminho: {org}/{ano}/{arquivo}.
DROP POLICY IF EXISTS "bank_statements_read"   ON storage.objects;
CREATE POLICY "bank_statements_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bank-statements'
         AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid));

DROP POLICY IF EXISTS "bank_statements_insert" ON storage.objects;
CREATE POLICY "bank_statements_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-statements'
              AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid));

DROP POLICY IF EXISTS "bank_statements_delete" ON storage.objects;
CREATE POLICY "bank_statements_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bank-statements'
         AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid));

-- ── Diagnóstico da conta: saldo informado × calculado, e buracos de período ──
-- SECURITY INVOKER: a RLS de bank_transactions e payment_accounts continua valendo.
CREATE OR REPLACE FUNCTION public.fn_bank_account_completeness(p_bank_account_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
WITH conta AS (
  SELECT pa.id, pa.name,
         COALESCE(pa.opening_balance, 0)                      AS opening_balance,
         pa.opening_balance_date
    FROM public.payment_accounts pa WHERE pa.id = p_bank_account_id
),
ultimo AS (
  SELECT i.* FROM public.bank_statement_imports i
   WHERE i.bank_account_id = p_bank_account_id AND i.ledger_balance IS NOT NULL
   ORDER BY i.ledger_balance_date DESC NULLS LAST, i.created_at DESC LIMIT 1
),
calculado AS (
  SELECT COALESCE(SUM(CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END), 0) AS soma
    FROM public.bank_transactions bt, conta c, ultimo u
   WHERE bt.bank_account_id = p_bank_account_id
     AND bt.status <> 'IGNORED'
     AND bt.transaction_date >= COALESCE(c.opening_balance_date, DATE '1900-01-01')
     AND bt.transaction_date <= u.ledger_balance_date
),
buracos AS (
  SELECT count(*) AS n FROM (
    SELECT i.period_start,
           lag(i.period_end) OVER (ORDER BY i.period_start) AS anterior_fim
      FROM public.bank_statement_imports i
     WHERE i.bank_account_id = p_bank_account_id AND i.period_start IS NOT NULL AND i.period_end IS NOT NULL
  ) s WHERE anterior_fim IS NOT NULL AND period_start > anterior_fim + 1
)
SELECT jsonb_build_object(
  'account_id',           (SELECT id FROM conta),
  'account_name',         (SELECT name FROM conta),
  'opening_balance',      (SELECT opening_balance FROM conta),
  'opening_balance_date', (SELECT opening_balance_date FROM conta),
  'has_opening',          (SELECT opening_balance_date IS NOT NULL FROM conta),
  'ledger_balance',       (SELECT ledger_balance FROM ultimo),
  'ledger_balance_date',  (SELECT ledger_balance_date FROM ultimo),
  'calculated_balance',   CASE WHEN (SELECT count(*) FROM ultimo) = 0 THEN NULL
                               ELSE (SELECT opening_balance FROM conta) + (SELECT soma FROM calculado) END,
  'difference',           CASE WHEN (SELECT count(*) FROM ultimo) = 0 THEN NULL
                               ELSE (SELECT ledger_balance FROM ultimo)
                                    - ((SELECT opening_balance FROM conta) + (SELECT soma FROM calculado)) END,
  'period_gaps',          (SELECT n FROM buracos),
  'imports',              (SELECT count(*) FROM public.bank_statement_imports WHERE bank_account_id = p_bank_account_id),
  'last_period_end',      (SELECT max(period_end) FROM public.bank_statement_imports WHERE bank_account_id = p_bank_account_id)
);
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_bank_account_completeness(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_bank_account_completeness(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_bank_account_completeness(uuid) IS
  'Saldo informado pelo banco no último arquivo × saldo calculado a partir do saldo inicial, e quantos buracos de período existem entre importações.';
