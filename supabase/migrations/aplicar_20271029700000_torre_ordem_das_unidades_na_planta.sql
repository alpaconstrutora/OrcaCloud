-- Como a Planta Inteligente arruma as unidades de cada torre no pavimento (28/10/2026).
--
-- Pedido: "implemente opção de ordenação de duas maneiras pelas setas ou pela posição. O usuário escolhe". Decisão do
-- usuário: "Nos dois" — o Empreendimento define o padrão (aqui, por torre, em Torres e Unidades › Unidades, ao lado
-- das setas) e a Planta deixa cada usuário trocar só para a sua visualização (preferência, sem coluna).
-- Plano: docs/planos/2026-10-28-ordem-das-unidades-setas-ou-posicao.md.
--
--   'POSICAO' = pela Posição (frente, fundos, lateral) e a Orientação de cada unidade; sem elas, pelo número.
--               É o que a Planta faz hoje — por isso é o padrão: nenhuma planta muda ao aplicar.
--   'SETAS'   = na ordem gravada pelas setas ↑↓ (sort_order das unidades).
--
-- Coluna nova em `empreendimento_towers`: o RLS da tabela vale para ela sem nada a fazer. Idempotente. Aplicar com
-- `npx supabase db query --linked -f` — nunca `db push`.

ALTER TABLE public.empreendimento_towers
  ADD COLUMN IF NOT EXISTS ordem_das_unidades_na_planta text NOT NULL DEFAULT 'POSICAO'
    CONSTRAINT empreendimento_towers_ordem_das_unidades_na_planta_valida CHECK (ordem_das_unidades_na_planta IN ('POSICAO', 'SETAS'));

COMMENT ON COLUMN public.empreendimento_towers.ordem_das_unidades_na_planta IS
  'Como a Planta Inteligente arruma as unidades no pavimento: POSICAO (Posição/Orientação; sem elas, o número) ou SETAS (a ordem das setas, sort_order).';

NOTIFY pgrst, 'reload schema';
