-- Objetivo do empreendimento ganha "Imobilizado" (imóvel que a empresa mantém no ativo
-- imobilizado: nem à venda nem para locar — sem espelho de Vendas nem de Locações, como o
-- Serviço). Pedido de 25/11/2026 —
-- docs/planos/2026-11-25-empreendimento-objetivo-imobilizado.md.
--
-- Só troca o CHECK (último: aplicar_20271121997500_empreendimento_objetivo_servico.sql).
-- Sem policy nem função (REGRA #7 não se aplica). Idempotente.
-- Reverter (só sem nenhum IMOBILIZADO gravado):
--   ALTER TABLE public.empreendimentos DROP CONSTRAINT IF EXISTS empreendimentos_objetivo_check;
--   ALTER TABLE public.empreendimentos ADD CONSTRAINT empreendimentos_objetivo_check
--     CHECK (objetivo IN ('VENDAS', 'LOCACAO', 'MISTO', 'SERVICO'));

ALTER TABLE public.empreendimentos DROP CONSTRAINT IF EXISTS empreendimentos_objetivo_check;
ALTER TABLE public.empreendimentos
  ADD CONSTRAINT empreendimentos_objetivo_check
  CHECK (objetivo IN ('VENDAS', 'LOCACAO', 'MISTO', 'SERVICO', 'IMOBILIZADO'));

COMMENT ON COLUMN public.empreendimentos.objetivo IS
  'VENDAS | LOCACAO | MISTO | SERVICO | IMOBILIZADO — quais espelhos (Vendas/Locações) a ficha do empreendimento mostra; SERVICO e IMOBILIZADO não mostram nenhum.';
