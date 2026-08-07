-- ═════════════════════════════════════════════════════════════════════════════
-- OPEX por imóvel — PARTE 4 de 4: `vw_payables` expõe o imóvel
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 3 terminar.
--
-- Recria a view mantendo TUDO que ela já fazia e acrescentando `property_id`,
-- `property_allocation_mode` e o nome do imóvel. Sem isso, Contas a Pagar não
-- consegue mostrar nem filtrar a dimensão que a parte 1 criou.
--
-- ⚠️ DUAS COISAS NÃO PODEM SE PERDER na recriação — as duas já foram corrigidas
-- por migrations anteriores e voltariam a ser buraco se eu esquecesse:
--   1. `WITH (security_invoker = on)` — sem isso a view roda como o DONO e
--      passa por cima da RLS de quem consulta.
--   2. `REVOKE ... FROM anon` NOMINAL — `REVOKE FROM PUBLIC` não basta, porque
--      o Supabase concede a `anon` diretamente por default privileges.
--      Ver 20270840000001_vw_payables_revoke_anon.sql.
--
-- Base: 20270848000000_vw_payables_plano_de_contas.sql (última versão).

SET lock_timeout = '5s';

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
  -- Dimensão imóvel (Fase 2). `property_allocation_mode` viaja junto porque a
  -- tela precisa distinguir "lançado no edifício" de "rateado entre unidades"
  -- sem uma segunda consulta.
  it.property_id,
  it.property_allocation_mode,
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
  p.name  AS project_name,
  cp.name AS property_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
LEFT JOIN public.commercial_properties cp ON cp.id = it.property_id
WHERE it.direction = 'DEBIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

REVOKE ALL ON public.vw_payables FROM PUBLIC;
REVOKE ALL ON public.vw_payables FROM anon;
GRANT SELECT ON public.vw_payables TO authenticated;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. A view voltou com as colunas novas:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'vw_payables' AND column_name LIKE 'property%';
--
-- 2. security_invoker preservado (deve conter security_invoker=on):
-- SELECT reloptions FROM pg_class WHERE relname = 'vw_payables';
--
-- 3. anon NÃO pode aparecer:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'vw_payables';
--
-- 4. Contas a Pagar tem de continuar funcionando igual — a contagem antes e
--    depois desta migration deve bater:
-- SELECT count(*) FROM public.vw_payables;
