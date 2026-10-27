-- Elevação do pavimento no Empreendimento (27/10/2026).
--
-- Pedido: "Para não haver confusão entre pavimentos, sugiro incluir elevação, assim não teremos dúvida da posição do
-- pavimento." Decisão do usuário: AS DUAS formas — a elevação é CALCULADA (a do térreo + os pés-direitos de baixo;
-- subsolos negativos) e pode ser DIGITADA num pavimento, que então vale no lugar do cálculo (o app avisa quando a
-- digitada não bate com o pé-direito do pavimento de baixo).
-- Plano: docs/planos/2026-10-27-elevacao-do-pavimento.md.
--
--  - empreendimento_towers.elevacao_terreo_m: a elevação do térreo, a referência da torre (+0,00 relativo, ou a
--    cota altimétrica do projeto). NULL = 0.
--  - empreendimento_floors.elevacao_m: a elevação digitada do pavimento (do 1º, quando o pavimento se repete);
--    NULL = calculada.
--
-- Metros com duas casas, como a tela digita. A faixa (-1000 a 10000 m) só barra erro de digitação: cabe tanto o
-- nível relativo quanto a cota altimétrica. Só colunas novas e anuláveis: nenhuma linha muda; o RLS das tabelas vale
-- para elas sem nada a fazer. Idempotente (IF NOT EXISTS). Aplicar com `npx supabase db query --linked -f` — nunca
-- `db push`.

ALTER TABLE public.empreendimento_floors
  ADD COLUMN IF NOT EXISTS elevacao_m numeric(7,2)
    CONSTRAINT empreendimento_floors_elevacao_m_faixa CHECK (elevacao_m IS NULL OR elevacao_m BETWEEN -1000 AND 10000);

COMMENT ON COLUMN public.empreendimento_floors.elevacao_m IS
  'Elevação digitada do pavimento (do 1º, quando se repete), em metros; NULL = calculada pela elevação do térreo da torre e pelos pés-direitos.';

ALTER TABLE public.empreendimento_towers
  ADD COLUMN IF NOT EXISTS elevacao_terreo_m numeric(7,2)
    CONSTRAINT empreendimento_towers_elevacao_terreo_m_faixa CHECK (elevacao_terreo_m IS NULL OR elevacao_terreo_m BETWEEN -1000 AND 10000);

COMMENT ON COLUMN public.empreendimento_towers.elevacao_terreo_m IS
  'Elevação do térreo da torre, em metros (nível de referência: +0,00 ou a cota altimétrica); NULL = 0. Os pavimentos sem elevação digitada são calculados a partir dela.';

NOTIFY pgrst, 'reload schema';
