-- ============================================================
-- Hard-lock de Período Fechado via Triggers de Banco
-- OrçaCloud SaaS · Migration 20261220000004
-- Idempotente (Regra de Ouro 10).
--
-- Bloqueia INSERT/UPDATE/DELETE em internal_transactions e
-- bank_transactions cuja transaction_date caia num mês fechado
-- (financial_period_locks). Reaproveita fn_period_is_closed.
--
-- Política de bypass:
--   • current_user <> 'authenticated'  → passa direto.
--     Cobre service_role (Edge Functions: asaas-webhook/charge) e o
--     owner (migrations/cron). PostgREST não consegue SET LOCAL, então
--     o bypass é por ROLE, não por GUC.
--   • source_system = 'COMMERCIAL'     → isenta o sync comercial.
--   • UPDATE que só reclassifica (categoria/obra/CC/contraparte) sem
--     mexer em colunas financeiras materiais → permitido.
-- ============================================================

-- CREATE/DROP TRIGGER exige AccessExclusiveLock na tabela. Se o app
-- estiver escrevendo ao mesmo tempo, pode ocorrer deadlock (40P01).
-- lock_timeout faz a migration abortar rápido e limpa para re-execução,
-- em vez de ficar presa. Se falhar, basta rodar de novo (idempotente),
-- de preferência em momento de baixo uso.
SET lock_timeout = '4s';

-- ─────────────────────────────────────────────────────────────
-- internal_transactions
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_block_period_internal_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
DECLARE
  rec public.internal_transactions;
BEGIN
  -- Bypass de sistema (service_role / owner)
  IF current_user <> 'authenticated' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  rec := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  -- Isenção do sync comercial
  IF COALESCE(NEW.source_system, OLD.source_system) = 'COMMERCIAL' THEN
    RETURN rec;
  END IF;

  -- UPDATE puramente de reclassificação/enriquecimento é permitido
  IF TG_OP = 'UPDATE'
     AND NEW.amount           =          OLD.amount
     AND NEW.direction        =          OLD.direction
     AND NEW.transaction_date =          OLD.transaction_date
     AND NEW.status           IS NOT DISTINCT FROM OLD.status
     AND NEW.business_status  IS NOT DISTINCT FROM OLD.business_status THEN
    RETURN NEW;
  END IF;

  -- Mês da transação (alvo) fechado → bloqueia
  IF public.fn_period_is_closed(rec.organization_id, rec.transaction_date) THEN
    RAISE EXCEPTION 'Período %/% fechado: reabra o mês no Fechamento Mensal para alterar lançamentos.',
      LPAD(EXTRACT(MONTH FROM rec.transaction_date)::int::text, 2, '0'),
      EXTRACT(YEAR FROM rec.transaction_date)::int
      USING ERRCODE = 'check_violation';
  END IF;

  -- UPDATE que move um lançamento para FORA de um mês fechado também bloqueia
  IF TG_OP = 'UPDATE'
     AND OLD.transaction_date <> NEW.transaction_date
     AND public.fn_period_is_closed(OLD.organization_id, OLD.transaction_date) THEN
    RAISE EXCEPTION 'Período %/% fechado: não é possível mover um lançamento de um mês já fechado.',
      LPAD(EXTRACT(MONTH FROM OLD.transaction_date)::int::text, 2, '0'),
      EXTRACT(YEAR FROM OLD.transaction_date)::int
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN rec;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_block_period_internal_tx ON public.internal_transactions;
CREATE TRIGGER trg_block_period_internal_tx
  BEFORE INSERT OR UPDATE OR DELETE ON public.internal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_period_internal_tx();

-- ─────────────────────────────────────────────────────────────
-- bank_transactions (sem source_system / business_status)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_block_period_bank_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
DECLARE
  rec public.bank_transactions;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  rec := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  -- UPDATE puramente de reclassificação (categoria/contraparte/obra) é permitido
  IF TG_OP = 'UPDATE'
     AND NEW.amount           =          OLD.amount
     AND NEW.direction        =          OLD.direction
     AND NEW.transaction_date =          OLD.transaction_date
     AND NEW.status           IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.fn_period_is_closed(rec.organization_id, rec.transaction_date) THEN
    RAISE EXCEPTION 'Período %/% fechado: reabra o mês no Fechamento Mensal para alterar movimentos.',
      LPAD(EXTRACT(MONTH FROM rec.transaction_date)::int::text, 2, '0'),
      EXTRACT(YEAR FROM rec.transaction_date)::int
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.transaction_date <> NEW.transaction_date
     AND public.fn_period_is_closed(OLD.organization_id, OLD.transaction_date) THEN
    RAISE EXCEPTION 'Período %/% fechado: não é possível mover um movimento de um mês já fechado.',
      LPAD(EXTRACT(MONTH FROM OLD.transaction_date)::int::text, 2, '0'),
      EXTRACT(YEAR FROM OLD.transaction_date)::int
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN rec;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_block_period_bank_tx ON public.bank_transactions;
CREATE TRIGGER trg_block_period_bank_tx
  BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_period_bank_tx();

-- FIM: 20261220000004_period_lock_triggers.sql
