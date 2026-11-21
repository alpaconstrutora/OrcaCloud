-- Objetivo do empreendimento ganha "Serviço" (obra/prestação para terceiro: sem espelho de
-- Vendas nem de Locações). Pedido de 21/11/2026 —
-- docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md.
--
-- Só troca o CHECK criado em aplicar_20271121900000_empreendimento_objetivo.sql.
-- Sem policy nem função (REGRA #7 não se aplica). Idempotente.
-- Reverter (só sem nenhum SERVICO gravado):
--   ALTER TABLE public.empreendimentos DROP CONSTRAINT IF EXISTS empreendimentos_objetivo_check;
--   ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_objetivo_check
--     CHECK (objetivo IN ('VENDAS', 'LOCACAO', 'MISTO'));

ALTER TABLE public.empreendimentos DROP CONSTRAINT IF EXISTS empreendimentos_objetivo_check;
ALTER TABLE public.empreendimentos
  ADD CONSTRAINT empreendimentos_objetivo_check
  CHECK (objetivo IN ('VENDAS', 'LOCACAO', 'MISTO', 'SERVICO'));

COMMENT ON COLUMN public.empreendimentos.objetivo IS
  'VENDAS | LOCACAO | MISTO | SERVICO — quais espelhos (Vendas/Locações) a ficha do empreendimento mostra; SERVICO não mostra nenhum.';
