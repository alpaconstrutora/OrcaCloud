-- ==========================================================================
-- reconciliation_runs — toda execução do motor deixa rastro
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 3.3)
-- ==========================================================================
-- O QUE ISTO RESOLVE
-- Em 06/09/2026 o usuário clicou em "Reprocessar" três vezes achando que o motor
-- tinha rodado, e nas duas primeiras ele não rodou. Não havia como saber: a única
-- forma de descobrir foi comparar o `created_at` das sugestões com a hora do clique.
-- Um motor que escreve em conta financeira e não registra que rodou é um motor que
-- ninguém consegue auditar nem depurar.
--
-- Cada execução passa a gravar: quem disparou, em qual conta, quanto tempo levou, o
-- que fez, e — o mais importante — se FALHOU e por quê. Erro que só existia no
-- console do navegador some quando a aba fecha.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id    UUID        REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  -- Quem pediu: clique na tela, importação de extrato, ou rotina.
  trigger            TEXT        NOT NULL CHECK (trigger IN ('MANUAL', 'IMPORT', 'CRON')),
  status             TEXT        NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'DONE', 'FAILED')),
  -- O que fez.
  auto_matched       INT         NOT NULL DEFAULT 0,
  exact_unique       INT         NOT NULL DEFAULT 0,
  transfers_paired   INT         NOT NULL DEFAULT 0,
  suggestions        INT         NOT NULL DEFAULT 0,
  bank_rows_scanned  INT         NOT NULL DEFAULT 0,
  title_rows_scanned INT         NOT NULL DEFAULT 0,
  -- Se falhou.
  error_message      TEXT,
  error_code         TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  duration_ms        INT,
  created_by         UUID        DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_conta
  ON public.reconciliation_runs (bank_account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_org
  ON public.reconciliation_runs (organization_id, started_at DESC);

COMMENT ON TABLE public.reconciliation_runs IS
  'Uma linha por execução do motor de conciliação. Existe porque em 06/09/2026 não havia como saber se o motor tinha rodado — a única pista era o created_at das sugestões.';
COMMENT ON COLUMN public.reconciliation_runs.error_message IS
  'Mensagem real da falha. Sem isto, o erro vive só no console do navegador e some quando a aba fecha.';

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_runs_org" ON public.reconciliation_runs;
CREATE POLICY "reconciliation_runs_org"
  ON public.reconciliation_runs
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.reconciliation_runs TO authenticated;

-- ── Última execução de cada conta, para a tela responder "rodou?" ──────────
CREATE OR REPLACE FUNCTION public.fn_reconciliation_last_run(p_bank_account_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
SELECT COALESCE(to_jsonb(r), 'null'::jsonb)
  FROM (
    SELECT id, trigger, status, auto_matched, exact_unique, transfers_paired, suggestions,
           bank_rows_scanned, title_rows_scanned, error_message, error_code,
           started_at, finished_at, duration_ms
      FROM public.reconciliation_runs
     WHERE bank_account_id = p_bank_account_id
     ORDER BY started_at DESC
     LIMIT 1
  ) r;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_last_run(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_last_run(uuid) TO authenticated;
