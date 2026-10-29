-- A 3ª forma de arrumar as unidades na Planta: ARRASTADAS na planta baixa (28/10/2026).
--
-- Pedido: "Implemente uma terceira forma de posicionar as unidades além das setas e da posição. Essa terceira forma
-- seria clicar, segurar e arrastar para a posição desejada na planta". Decisões do usuário: arrastar na planta 2D; o
-- arrasto vale para o pavimento ou para a coluna inteira (quem arrasta escolhe); gravado no Empreendimento.
-- Plano: docs/planos/2026-10-28-unidades-arrastadas-na-planta.md.
--
--  - `empreendimento_towers.ordem_das_unidades_na_planta` aceita 'ARRASTO' (além de POSICAO e SETAS).
--  - `empreendimento_units.vaga_na_planta`: a vaga da unidade no pavimento da massa — 0 a n−1, a 1ª fileira ao
--    longo do lado maior e depois a 2ª (a mesma numeração de `fatiasPorDirecao`). null = sem vaga arrastada.
--
-- Colunas/CHECK em tabelas existentes: o RLS delas vale sem nada a fazer. Nenhuma linha muda de sentido (a vaga
-- nasce null; a torre continua no que estava). Idempotente. Aplicar com `npx supabase db query --linked -f` — nunca
-- `db push`.

ALTER TABLE public.empreendimento_towers
  DROP CONSTRAINT IF EXISTS empreendimento_towers_ordem_das_unidades_na_planta_valida;
ALTER TABLE public.empreendimento_towers
  ADD CONSTRAINT empreendimento_towers_ordem_das_unidades_na_planta_valida
    CHECK (ordem_das_unidades_na_planta IN ('POSICAO', 'SETAS', 'ARRASTO'));

COMMENT ON COLUMN public.empreendimento_towers.ordem_das_unidades_na_planta IS
  'Como a Planta Inteligente arruma as unidades no pavimento: POSICAO (Posição/Orientação; sem elas, o número), SETAS (a ordem das setas, sort_order) ou ARRASTO (a vaga arrastada na planta, empreendimento_units.vaga_na_planta).';

ALTER TABLE public.empreendimento_units
  ADD COLUMN IF NOT EXISTS vaga_na_planta smallint
    CONSTRAINT empreendimento_units_vaga_na_planta_valida CHECK (vaga_na_planta IS NULL OR vaga_na_planta BETWEEN 0 AND 999);

COMMENT ON COLUMN public.empreendimento_units.vaga_na_planta IS
  'A vaga da unidade no pavimento da massa da Planta Inteligente, arrastada na planta baixa: 0..n-1, a 1ª fileira ao longo do lado maior e depois a 2ª. null = sem vaga.';

NOTIFY pgrst, 'reload schema';
