-- ============================================================
-- Restaura o cadastro "Plano de Contas" (Minha Organização)
-- ============================================================
-- A migration 20270822000009 renomeou a tabela `cost_centers` para
-- `cost_centers_legacy` tratando-a como "Centro de Custo antigo" — mas essa
-- tabela era, na verdade, o PLANO DE CONTAS do cliente (estrutura contábil
-- hierárquica, códigos pontilhados 1.4.6.1, 160+ registros por organização,
-- rótulo "Plano de Contas" desde a migration de rótulo 85b6a45). Foi um engano.
--
-- Plano de Contas ≠ Centro de Custo. São duas dimensões diferentes:
--   • Centro de Custo  → cost_centers_v2 (módulo novo, grupo/subgrupo) — INTACTO.
--   • Plano de Contas  → esta tabela (restaurada aqui como `plano_de_contas`).
--
-- Renomeia para um nome SEM AMBIGUIDADE (`plano_de_contas`) para encerrar de vez
-- a confusão cost_centers × plano de contas. Idempotente: só age se a origem
-- existir e o destino ainda não. As policies de RLS e os dados (160+ linhas)
-- acompanham o rename automaticamente.

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cost_centers_legacy'
     )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'plano_de_contas'
     )
  THEN
    ALTER TABLE public.cost_centers_legacy RENAME TO plano_de_contas;
  END IF;
END $$;

-- Coluna "Natureza" (Credora/Devedora) — pedido do usuário. Diferente de
-- financial_categories, esta tabela não tem `nature`/`dre_group` para derivar,
-- então começa NULL (preenchimento manual na tela).
ALTER TABLE public.plano_de_contas
  ADD COLUMN IF NOT EXISTS accounting_nature TEXT
  CHECK (accounting_nature IN ('CREDORA', 'DEVEDORA'));

COMMENT ON TABLE public.plano_de_contas IS
  'Plano de Contas por organização (estrutura contábil hierárquica, códigos '
  'pontilhados). Restaurada de cost_centers_legacy em 2027-08-22. NÃO confundir '
  'com cost_centers_v2 (Centro de Custo, dimensão diferente).';

-- Garante que o PostgREST enxergue a tabela renomeada sem esperar o refresh automático.
NOTIFY pgrst, 'reload schema';
