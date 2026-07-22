-- Plano de Contas — coluna "Natureza" (Credora/Devedora)
-- Independente do "nature" já existente (REVENUE/COST/EXPENSE/LIABILITY/ASSET,
-- usado pelo motor de DRE) — aquele classifica o grupo de resultado, este
-- classifica o lado da partida dobrada em que a conta normalmente aumenta.

ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS accounting_nature TEXT CHECK (accounting_nature IN ('CREDORA', 'DEVEDORA'));

-- Backfill a partir do "nature" existente:
--   Receita/Passivo aumentam a crédito  -> CREDORA
--   Ativo/Custo/Despesa aumentam a débito -> DEVEDORA
UPDATE public.financial_categories
SET accounting_nature = CASE
  WHEN nature IN ('REVENUE', 'LIABILITY')      THEN 'CREDORA'
  WHEN nature IN ('ASSET', 'COST', 'EXPENSE')  THEN 'DEVEDORA'
  ELSE accounting_nature
END
WHERE accounting_nature IS NULL;
