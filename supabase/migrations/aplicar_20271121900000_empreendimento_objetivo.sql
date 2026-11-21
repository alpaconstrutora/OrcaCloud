-- Objetivo do empreendimento: Vendas, Locação ou Misto (venda e locação).
-- Pedido de 21/11/2026 — docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md.
--
-- Decide quais abas de espelho a ficha mostra: Vendas esconde o Espelho de Locações,
-- Locação esconde o Espelho de Vendas, Misto mostra as duas. Os empreendimentos que já
-- existem nascem Misto (decisão do usuário), então nenhuma aba some de ninguém.
--
-- Sem policy nem função (REGRA #7 não se aplica). Idempotente.
-- Reverter: ALTER TABLE public.empreendimentos DROP COLUMN IF EXISTS objetivo;

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS objetivo text NOT NULL DEFAULT 'MISTO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empreendimentos_objetivo_check'
      AND conrelid = 'public.empreendimentos'::regclass
  ) THEN
    ALTER TABLE public.empreendimentos
      ADD CONSTRAINT empreendimentos_objetivo_check
      CHECK (objetivo IN ('VENDAS', 'LOCACAO', 'MISTO'));
  END IF;
END $$;

COMMENT ON COLUMN public.empreendimentos.objetivo IS
  'VENDAS | LOCACAO | MISTO — quais espelhos (Vendas/Locações) a ficha do empreendimento mostra.';
