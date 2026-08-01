-- ==========================================================================
-- vw_payables — expõe plano_de_contas_id (Contas a Pagar)
-- Date: 2026-08-01
-- ==========================================================================
-- Espelho de 20270847000000 (vw_receivables) para o lado DEBIT. `cost_center_id`
-- já era exposto pela view; só faltava `plano_de_contas_id`, adicionada em
-- `internal_transactions` pela migration 20270846000000.
--
-- ⚠️ ATENÇÃO AO RECRIAR ESTA VIEW: ela tem DUAS proteções que uma recriação
-- ingênua (DROP/CREATE sem repetir os extras) apagaria silenciosamente:
--   1. WITH (security_invoker = on) — sem isso a view roda como o dono e
--      ignora a RLS de internal_transactions, vazando entre organizações.
--   2. REVOKE explícito de `anon` — REVOKE ALL FROM PUBLIC não basta porque o
--      Supabase tem ALTER DEFAULT PRIVILEGES concedendo SELECT a `anon`
--      diretamente (grant de papel, não herdado de PUBLIC). Ver
--      20270840000001_vw_payables_revoke_anon.sql — sem repetir esse REVOKE,
--      esta migration reabriria o buraco que aquela fechou.
-- ==========================================================================

DROP VIEW IF EXISTS public.vw_payables;

CREATE VIEW public.vw_payables
WITH (security_invoker = on) AS
SELECT
  it.id,
  it.organization_id,
  it.source_system,
  it.reference_id,
  it.transaction_date,
  it.due_date,
  it.amount,
  it.direction,
  it.description,
  it.category,
  it.status,
  it.business_status,
  it.party_id,
  it.party_name,
  it.party_type,
  it.entity_name,
  it.project_id,
  it.cost_center_id,
  it.plano_de_contas_id,
  it.created_at,
  it.updated_at,
  -- status efetivo: VENCIDO é computado dinamicamente para não exigir cron.
  -- COALESCE na condição (não só no ELSE): business_status nulo = PREVISTO.
  CASE
    WHEN COALESCE(it.business_status, 'PREVISTO') IN ('PREVISTO','EMITIDO','ENVIADO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction = 'DEBIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

-- RPC/view nova = REVOKE PUBLIC. GRANT a authenticated sozinho não bloqueia
-- anon, porque anon herda de PUBLIC.
REVOKE ALL ON public.vw_payables FROM PUBLIC;
GRANT SELECT ON public.vw_payables TO authenticated;

-- Default privileges do Supabase concedem SELECT a `anon` diretamente em todo
-- objeto novo (grant de papel, não herdado de PUBLIC) — REVOKE FROM PUBLIC
-- acima não fecha isso. Ver 20270840000001_vw_payables_revoke_anon.sql.
REVOKE ALL ON public.vw_payables FROM anon;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- FIM: 20270848000000_vw_payables_plano_de_contas.sql
-- ==========================================================================
