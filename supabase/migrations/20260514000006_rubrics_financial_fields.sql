-- ══════════════════════════════════════════════════════════════════════════════
-- rubrics: lancamento_individualizado + dia_lancamento
-- Quando lancamento_individualizado = true, ao fechar a folha o sistema gera
-- um lançamento separado no financeiro (internal_transactions) por funcionário.
-- dia_lancamento define o dia do mês para vencimento (ex: 10 → dia 10 do mês
-- de competência da folha). Se nulo, usa o último dia do período da folha.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS lancamento_individualizado BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_lancamento             SMALLINT   CHECK (dia_lancamento BETWEEN 1 AND 28);

-- ADIANTAMENTO deve gerar parcela separada no financeiro por padrão
UPDATE public.rubrics
SET lancamento_individualizado = true
WHERE code = 'ADIANTAMENTO';
