-- ============================================================
-- ÒPURA Financial Analytics — Fase 0: dimensões do razão
-- OrçaCloud SaaS · Migration 20261221000001
-- Idempotente (Regra de Ouro 10).
--
-- Objetivo: tornar first-class no razão (internal_transactions)
-- as dimensões que o PRD ÒPURA exige como filtro universal e
-- drill-down, mas que hoje só existem via parsing de reference_id
-- ou não existem:
--   • supplier_id        (Fornecedor)  ← party_id só aponta p/ clients
--   • contract_id        (Contrato)
--   • purchase_order_id  (Pedido de Compra)
--   • payment_account_id (Conta Bancária)
--   • payment_date       (Data de pagamento, distinta de transaction_date)
--   • created_by         (Usuário/lançador)
--   • parent_id em financial_categories (Subcategoria)
--
-- NÃO incluídos de propósito:
--   • empresa_id      → já derivável via projects.empresa_id
--   • empreendimento  → exige decisão de produto (≠ obra/project_id)
--
-- Backfill best-effort a partir das fontes com vínculo derivável
-- (contracts, purchase_orders, reconciliation_matches, audit log).
-- Lançamentos sem origem rastreável ficam NULL (esperado).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Novas dimensões no razão
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS supplier_id        UUID REFERENCES public.suppliers(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_id        UUID REFERENCES public.contracts(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES public.purchase_orders(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_date       DATE,
  ADD COLUMN IF NOT EXISTS created_by         UUID REFERENCES auth.users(id)               ON DELETE SET NULL;

-- Índices parciais alinhados ao padrão de idx_internal_txs_project
CREATE INDEX IF NOT EXISTS idx_internal_txs_supplier
  ON public.internal_transactions (organization_id, supplier_id, transaction_date)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_contract
  ON public.internal_transactions (organization_id, contract_id, transaction_date)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_po
  ON public.internal_transactions (organization_id, purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_account
  ON public.internal_transactions (organization_id, payment_account_id, transaction_date)
  WHERE payment_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_payment_date
  ON public.internal_transactions (organization_id, payment_date)
  WHERE payment_date IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Subcategoria — hierarquia em financial_categories
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_categories_parent
  ON public.financial_categories (organization_id, parent_id)
  WHERE parent_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Backfill — fornecedor e contrato (origem CONTRACT_*)
--    reference_id começa com contracts.id (':pN' nos parcelados),
--    mesmo critério da migration 20261103000001 (DRE por obra).
-- ────────────────────────────────────────────────────────────

-- 3a. contract_id
UPDATE public.internal_transactions it
SET contract_id = c.id
FROM public.contracts c
WHERE it.contract_id IS NULL
  AND it.source_system LIKE 'CONTRACT%'
  AND it.reference_id LIKE c.id::text || '%';

-- 3b. supplier_id a partir do contrato (quando o contrato tem fornecedor)
--     Só em SAÍDAS (DEBIT): em CREDIT a contraparte é cliente (party_id),
--     não fornecedor — alinhado ao modelo de party (20261220000009).
UPDATE public.internal_transactions it
SET supplier_id = c.supplier_id
FROM public.contracts c
WHERE it.supplier_id IS NULL
  AND it.direction = 'DEBIT'
  AND c.supplier_id IS NOT NULL
  AND it.contract_id = c.id;

-- ────────────────────────────────────────────────────────────
-- 4. Backfill — pedido de compra e fornecedor (origem COMMERCIAL/ORDER)
--    reference_id = purchase_orders.id
-- ────────────────────────────────────────────────────────────

-- 4a. purchase_order_id
UPDATE public.internal_transactions it
SET purchase_order_id = po.id
FROM public.purchase_orders po
WHERE it.purchase_order_id IS NULL
  AND it.reference_id = po.id::text;

-- 4b. supplier_id a partir do pedido (pedido = saída → só DEBIT)
UPDATE public.internal_transactions it
SET supplier_id = po.supplier_id
FROM public.purchase_orders po
WHERE it.supplier_id IS NULL
  AND it.direction = 'DEBIT'
  AND po.supplier_id IS NOT NULL
  AND it.purchase_order_id = po.id;

-- ────────────────────────────────────────────────────────────
-- 5. Backfill — conta bancária (via conciliação)
--    reconciliation_matches.internal_transaction_id → bank_transactions
--    → bank_account_id (que após unify_bank_accounts referencia
--    payment_accounts).
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions it
SET payment_account_id = bt.bank_account_id
FROM public.reconciliation_matches m
JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
WHERE it.payment_account_id IS NULL
  AND m.internal_transaction_id = it.id
  AND bt.bank_account_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. Backfill — data de pagamento
--    Para lançamentos já conciliados, a data efetiva de pagamento
--    é a do extrato bancário conciliado; na ausência de match,
--    usa-se transaction_date como proxy apenas se CONCILIATED.
-- ────────────────────────────────────────────────────────────

-- 6a. data real do extrato conciliado
UPDATE public.internal_transactions it
SET payment_date = bt.transaction_date
FROM public.reconciliation_matches m
JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
WHERE it.payment_date IS NULL
  AND m.internal_transaction_id = it.id;

-- 6b. proxy p/ conciliados sem match explícito (boletos baixados etc.)
UPDATE public.internal_transactions it
SET payment_date = it.transaction_date
WHERE it.payment_date IS NULL
  AND it.status = 'CONCILIATED';

-- ────────────────────────────────────────────────────────────
-- 7. Backfill — usuário lançador (best-effort via audit log)
--    reconciliation_audit_log registra MANUAL_CREATE com
--    target_id = internal_transactions.id.
-- ────────────────────────────────────────────────────────────

UPDATE public.internal_transactions it
SET created_by = al.user_id
FROM public.reconciliation_audit_log al
WHERE it.created_by IS NULL
  AND al.target_id = it.id
  AND al.event_type = 'MANUAL_CREATE'
  AND al.user_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 8. Relatório de cobertura do backfill (NOTICE — auditável)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total      BIGINT;
  v_supplier   BIGINT;
  v_contract   BIGINT;
  v_po         BIGINT;
  v_account    BIGINT;
  v_paydate    BIGINT;
BEGIN
  SELECT COUNT(*)                                            INTO v_total    FROM public.internal_transactions;
  SELECT COUNT(*) FILTER (WHERE supplier_id        IS NOT NULL) INTO v_supplier FROM public.internal_transactions;
  SELECT COUNT(*) FILTER (WHERE contract_id        IS NOT NULL) INTO v_contract FROM public.internal_transactions;
  SELECT COUNT(*) FILTER (WHERE purchase_order_id  IS NOT NULL) INTO v_po       FROM public.internal_transactions;
  SELECT COUNT(*) FILTER (WHERE payment_account_id IS NOT NULL) INTO v_account  FROM public.internal_transactions;
  SELECT COUNT(*) FILTER (WHERE payment_date       IS NOT NULL) INTO v_paydate  FROM public.internal_transactions;

  RAISE NOTICE 'ÒPURA Fase 0 — cobertura backfill (total=%):', v_total;
  RAISE NOTICE '  supplier_id        : %', v_supplier;
  RAISE NOTICE '  contract_id        : %', v_contract;
  RAISE NOTICE '  purchase_order_id  : %', v_po;
  RAISE NOTICE '  payment_account_id : %', v_account;
  RAISE NOTICE '  payment_date       : %', v_paydate;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. Estende a camada de fatos (vw_fact_financial_tx) com as
--    novas dimensões. Mantém todas as colunas/flags de
--    20260710000002 (consumidas por fn_bi_executive em
--    20260710000003) para não quebrar consumidores; apenas
--    reordena e adiciona dimensões + nomes resolvidos.
--    DROP+CREATE (não REPLACE): CREATE OR REPLACE VIEW não permite
--    reordenar/renomear colunas existentes (erro 42P16). Nenhuma
--    view/matview depende desta — só funções, que não bloqueiam DROP.
-- ────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.vw_fact_financial_tx;
CREATE VIEW public.vw_fact_financial_tx AS
SELECT
  it.id,
  it.organization_id,
  it.transaction_date,
  it.payment_date,
  it.due_date,
  it.competencia_date,
  it.direction,
  it.status,
  it.business_status,
  it.approval_status,
  it.amount,
  -- dimensões
  it.category_id,
  fc.parent_id                                    AS category_parent_id,
  it.project_id,
  it.cost_center_id,
  it.supplier_id,
  it.contract_id,
  it.purchase_order_id,
  it.payment_account_id,
  it.party_id                                     AS client_id,
  it.created_by,
  p.empresa_id,
  -- nomes resolvidos (para drill-down sem novos joins na tela)
  COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
  COALESCE(fc.nature,    'EXPENSE')               AS nature,
  COALESCE(fc.name, it.category, 'Sem categoria') AS category_name,
  COALESCE(fc.sort_order, 99)                     AS sort_order,
  s.name                                          AS supplier_name,
  COALESCE(it.party_name, cl.name)                AS client_name,
  p.name                                          AS project_name,
  pa.name                                         AS account_name,
  it.source_system,
  it.reference_id,
  it.description,
  -- flags derivados (idênticos à versão original)
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS credit_realizado,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS debit_realizado,
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS credit_previsto,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS debit_previsto,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount
    ELSE 0
  END AS net_realizado,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN -it.amount
    ELSE 0
  END AS net_previsto
FROM public.internal_transactions it
LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
LEFT JOIN public.suppliers           s  ON s.id  = it.supplier_id
LEFT JOIN public.clients             cl ON cl.id = it.party_id
LEFT JOIN public.projects            p  ON p.id  = it.project_id
LEFT JOIN public.payment_accounts    pa ON pa.id = it.payment_account_id
WHERE it.status <> 'CANCELLED';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000001_opura_fase0_ledger_dimensions.sql
-- ────────────────────────────────────────────────────────────
