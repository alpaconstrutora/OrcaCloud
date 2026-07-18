-- ─────────────────────────────────────────────────────────────────────────────
-- Correção: contratos de LOCAÇÃO devem ser RECEITA do locador (a receber)
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexto: createFromDeal gravava direction='OUTGOING' fixo para todos os
-- domínios; syncRecurringToFinance traduz OUTGOING → DEBIT, então as parcelas de
-- aluguel nasciam como "a pagar" (DEBIT) — o oposto da perspectiva do locador.
-- Por isso não apareciam em vw_receivables nem em fn_inadimplencia.
--
-- A partir de agora createFromDeal grava INCOMING para LOCACAO (parcelas nascem
-- CREDIT). Esta migration corrige os contratos e parcelas JÁ existentes.
--
-- Idempotente: os filtros de direction impedem reprocessamento.
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`).

-- 1) Contratos de locação que nasceram OUTGOING → INCOMING
UPDATE public.contracts
   SET direction = 'INCOMING'
 WHERE domain = 'LOCACAO'
   AND direction = 'OUTGOING';

-- 2) Parcelas recorrentes desses contratos → CREDIT (a receber)
-- Cast explícito: internal_transactions.reference_id é TEXT (guarda também
-- '{contract_id}:p{n}' no caso parcelado), enquanto contracts.id é UUID.
UPDATE public.internal_transactions AS it
   SET direction = 'CREDIT'
  FROM public.contracts AS c
 WHERE it.source_system = 'CONTRACT_RECURRING'
   AND it.reference_id = c.id::text
   AND c.domain = 'LOCACAO'
   AND it.direction = 'DEBIT';

-- Observação: RLS herdada das tabelas existentes (contracts / internal_transactions).
-- Nenhuma policy nova é criada aqui.
