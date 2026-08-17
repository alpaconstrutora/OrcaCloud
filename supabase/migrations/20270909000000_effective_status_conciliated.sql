-- ==========================================================================
-- effective_status passa a reconhecer status='CONCILIATED' como baixa
-- Date: 2026-08-15
-- Views: vw_payables, vw_receivables
-- ==========================================================================
-- CONTEXTO
-- `effective_status` derivava SÓ de `business_status`. Só que cinco produtores
-- dão a baixa gravando `status='CONCILIATED'` sem nunca tocar em
-- `business_status`:
--
--   bankReconciliationService.ts:727   (conciliação bancária)
--   divergenceService.ts:167           (resolução de divergência)
--   financialService.ts:81             (transação criada já paga)
--   financialSyncService.ts:80,105     (sync de parcela paga)
--   boletoService.ts:520               (boleto marcado como pago)
--
-- Resultado: conciliar no extrato — ou pagar um boleto — NÃO dava baixa em
-- Contas a Pagar. O título seguia "Previsto"/"Vencido", às vezes em vermelho
-- como atrasado, já pago.
--
-- POR QUE CORRIGIR NA VIEW, E NÃO NOS CINCO PRODUTORES
-- É a mesma lição que 20270840000000 já escreveu para o COALESCE: "a view não
-- pode depender de o produtor lembrar de preencher a coluna". Corrigir aqui
-- conserta os cinco de uma vez, retroativamente, e também o sexto produtor que
-- ainda não existe. Além disso, os OUTROS leitores do sistema já checam os dois
-- campos (commercialFinanceService.ts:451, taxPayableService.ts:710:
-- `status !== 'CONCILIATED' && business_status !== 'PAGO'`) — a view é que
-- estava fora do padrão da casa, não eles.
--
-- DUAS DECISÕES DENTRO DO CASE
-- 1. PARCIAL e RENEGOCIADO SOBREVIVEM ao CONCILIATED. São estados que alguém
--    escolheu deliberadamente; a baixa não pode apagá-los.
-- 2. APROVADO entra na regra de VENCIDO. Título liberado pela alçada e vencido
--    mostrava "Aprovado", escondendo o atraso. AGUARDANDO_APROVACAO fica de
--    fora de propósito: ainda não é obrigação a pagar, vive na fila de
--    aprovação (financialApprovalService.listPendingQueue).
--
-- security_invoker=on é OBRIGATÓRIO nas duas: sem ele a view roda como o dono e
-- ignora a RLS de internal_transactions, vazando lançamentos entre organizações.
-- REVOKE PUBLIC também — GRANT a authenticated sozinho não bloqueia anon,
-- porque anon herda de PUBLIC (ver 20270840000001 e aplicar_20270903000001).
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ⚠️ O SQL Editor roda o script inteiro como UMA transação: erro no bloco 2
--    desfaz o bloco 1. É o comportamento desejado aqui (as duas views andam
--    juntas), mas não confunda "rodou metade" com "aplicou metade".
--
-- Base: aplicar_20270905000007_vw_payables_supplier_id.sql (vw_payables) e
--       20270847000000_vw_receivables_plano_de_contas.sql +
--       aplicar_20270903000001_vw_receivables_fechar_anon.sql (vw_receivables).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: as duas views precisam existir antes de recriar ────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'vw_payables' AND c.relkind = 'v'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: a view public.vw_payables nao existe.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'vw_receivables' AND c.relkind = 'v'
    ) THEN
        RAISE EXCEPTION 'ABORTADO: a view public.vw_receivables nao existe.';
    END IF;
END $$;

-- ==========================================================================
-- 1. vw_payables (direction = DEBIT) — baixa = PAGO
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
  it.supplier_id,
  it.project_id,
  it.cost_center_id,
  it.plano_de_contas_id,
  it.property_id,
  it.property_allocation_mode,
  it.created_at,
  it.updated_at,
  CASE
    -- Baixa efetiva, venha de qual produtor vier. PARCIAL/RENEGOCIADO ficam.
    WHEN it.status = 'CONCILIATED'
      AND COALESCE(it.business_status, 'PREVISTO') NOT IN ('PARCIAL','RENEGOCIADO')
    THEN 'PAGO'
    -- VENCIDO computado dinamicamente para não exigir cron. COALESCE na
    -- condição (não só no ELSE): business_status nulo = PREVISTO.
    WHEN COALESCE(it.business_status, 'PREVISTO') IN ('PREVISTO','EMITIDO','ENVIADO','APROVADO')
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

-- ==========================================================================
-- 2. vw_receivables (direction = CREDIT) — baixa = RECEBIDO
-- ==========================================================================
-- Mesma correção, senão a assimetria a pagar × a receber volta:
-- receivableService.ts:58 tem o padrão idêntico (`newStatus === 'RECEBIDO'`
-- grava status='CONCILIATED').

DROP VIEW IF EXISTS public.vw_receivables;

CREATE VIEW public.vw_receivables
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
  it.project_id,
  it.cost_center_id,
  it.plano_de_contas_id,
  it.created_at,
  it.updated_at,
  CASE
    WHEN it.status = 'CONCILIATED'
      AND COALESCE(it.business_status, 'PREVISTO') NOT IN ('PARCIAL','RENEGOCIADO')
    THEN 'RECEBIDO'
    WHEN COALESCE(it.business_status, 'PREVISTO') IN ('PREVISTO','EMITIDO','ENVIADO','APROVADO')
      AND it.due_date IS NOT NULL
      AND it.due_date < CURRENT_DATE
    THEN 'VENCIDO'
    ELSE COALESCE(it.business_status, 'PREVISTO')
  END AS effective_status,
  p.name AS project_name
FROM public.internal_transactions it
LEFT JOIN public.projects p ON p.id = it.project_id
WHERE it.direction = 'CREDIT'
  AND it.status    <> 'CANCELLED'
  AND it.entry_type IS DISTINCT FROM 'CONTRA';

REVOKE ALL ON public.vw_receivables FROM PUBLIC;
REVOKE ALL ON public.vw_receivables FROM anon;
GRANT SELECT ON public.vw_receivables TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. security_invoker preservado nas duas (deve listar security_invoker=true):
-- SELECT relname, reloptions FROM pg_class
--  WHERE relname IN ('vw_payables','vw_receivables');
--
-- 2. anon NÃO pode aparecer:
-- SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name IN ('vw_payables','vw_receivables');
--
-- 3. Os conciliados viraram PAGO (antes vinham PREVISTO/VENCIDO):
-- SELECT effective_status, count(*) FROM public.vw_payables
--  WHERE status = 'CONCILIATED' GROUP BY 1;
--    -> esperado: só PAGO (e PARCIAL/RENEGOCIADO, se houver)
--
-- 4. Nada mudou para quem NÃO está conciliado:
-- SELECT effective_status, count(*) FROM public.vw_payables
--  WHERE status <> 'CONCILIATED' GROUP BY 1;
-- ==========================================================================
