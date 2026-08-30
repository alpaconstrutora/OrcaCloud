-- ==========================================================================
-- Gestão de Dívidas · Convenção de contagem de dias (apropriação por competência)
-- Date: 2026-08-30
-- Altera: debt_contracts (+1 coluna)
-- Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
-- ==========================================================================
-- CONTEXTO
-- A apropriação de juros por competência precisa saber COMO contar dias, e a
-- convenção muda o número. Decisão do usuário (2026-08-30): implementar todas
-- as opções e deixar o usuário escolher — nenhuma imposta.
--
--   BUS/252  dias úteis / 252   -> padrão de CDI e Selic no Brasil
--   ACT/365  dias corridos / 365
--   ACT/360  dias corridos / 360
--   ACT/ACT  dias corridos / dias reais do ano (365 ou 366)
--   30/360   mês comercial de 30 / ano de 360 (regra US/NASD)
--
-- ⚠️ A coluna é NULLABLE e SEM DEFAULT, de propósito. Um default silencioso
-- decidiria, no lugar do usuário, um número que vai para a contabilidade — e
-- contrato indexado a CDI contado em ACT/365 dá resultado diferente do que o
-- banco apura. NULL significa "ainda não definida", e a tela pede antes de
-- apropriar, em vez de chutar.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'debt_contracts') THEN
        RAISE EXCEPTION 'ABORTADO: debt_contracts nao existe (rode aplicar_20270915000001 antes).';
    END IF;
END $$;

ALTER TABLE public.debt_contracts
    ADD COLUMN IF NOT EXISTS day_count_convention text;

DO $$ BEGIN
    ALTER TABLE public.debt_contracts
        ADD CONSTRAINT debt_contracts_day_count_chk
        CHECK (day_count_convention IS NULL OR day_count_convention IN (
            'BUS/252', 'ACT/365', 'ACT/360', 'ACT/ACT', '30/360'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.debt_contracts.day_count_convention IS
    'Como contar dias na apropriacao de juros por competencia. NULL = ainda nao '
    'definida — a tela pede antes de apropriar, em vez de assumir. BUS/252 e o '
    'padrao de CDI/Selic; contrato indexado contado em ACT/365 da resultado '
    'diferente do que o banco apura.';

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. A coluna existe e aceita as 5 convenções:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'debt_contracts_day_count_chk';
--    -> esperado: CHECK com BUS/252, ACT/365, ACT/360, ACT/ACT, 30/360
--
-- b. NULL continua permitido (é o "ainda não definida"):
-- SELECT COUNT(*) FROM public.debt_contracts WHERE day_count_convention IS NULL;
--    -> esperado: todos os contratos existentes, sem erro
--
-- c. Valor inválido é barrado:
-- UPDATE public.debt_contracts SET day_count_convention = 'ACT/999' WHERE false;
--    -> a constraint existe; testar com um id real dentro de BEGIN/ROLLBACK
-- ==========================================================================
-- FIM: aplicar_20270915000009_debt_daycount.sql
-- ==========================================================================
