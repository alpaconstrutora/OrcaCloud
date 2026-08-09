-- ==========================================================================
-- vw_payables — expõe supplier_id (Contas a Pagar respeita razão
-- social/apelido de Meus Fornecedores)
-- ==========================================================================
-- CONTEXTO
-- A coluna Credor de Contas a Pagar sempre mostrou o texto congelado em
-- `party_name`/`entity_name` (gravado no momento em que o pedido/contrato/
-- boleto foi criado), nunca o cadastro vivo do fornecedor. Resultado: mudar
-- a preferência "razão social × apelido" em Meus Fornecedores (SupplierList,
-- `appSettingsService.supplierNameDisplay`) não tinha efeito nenhum aqui —
-- diferente de toda outra tela que lista fornecedor (BankReconciliation,
-- Pedidos, Contratos, Notas Fiscais), que resolve isso ao vivo via
-- `getSupplierDisplayName`.
--
-- A causa é estrutural: `internal_transactions.supplier_id` existe desde
-- 20261221000001 (opura_fase0_ledger_dimensions) e é gravado normalmente
-- (ver boletoService.ts, financialService.ts), mas `vw_payables` nunca
-- selecionou essa coluna — não tinha como o client saber a qual fornecedor
-- cadastrado a linha pertence.
--
-- Esta migration só adiciona `it.supplier_id` à view. A resolução do nome
-- (nickname vs razão social) continua no client, no mesmo padrão já usado
-- para cost_center_name/plano_de_contas_name (ContasPagarParcelas.tsx).
--
-- ⚠️ DUAS COISAS NÃO PODEM SE PERDER na recriação (mesmas de sempre):
--   1. `WITH (security_invoker = on)` — sem isso a view roda como o DONO e
--      ignora a RLS de internal_transactions.
--   2. `REVOKE ... FROM anon` NOMINAL — `REVOKE FROM PUBLIC` não basta,
--      Supabase concede a `anon` por default privileges. Ver
--      20270840000001_vw_payables_revoke_anon.sql.
--
-- Base: aplicar_20270902000000/parte4_vw_payables_property.sql (última versão).
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

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
  it.supplier_id,
  it.project_id,
  it.cost_center_id,
  it.plano_de_contas_id,
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

NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. A coluna nova apareceu:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'vw_payables' AND column_name = 'supplier_id';
--
-- 2. security_invoker preservado:
-- SELECT reloptions FROM pg_class WHERE relname = 'vw_payables';
--
-- 3. anon NÃO pode aparecer:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'vw_payables';
--
-- 4. Contagem antes e depois deve bater:
-- SELECT count(*) FROM public.vw_payables;

-- ==========================================================================
-- FIM: aplicar_20270905000007_vw_payables_supplier_id.sql
-- ==========================================================================
