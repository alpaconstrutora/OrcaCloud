-- ============================================================================
-- Planta Inteligente — várias pranchas, camadas e item avulso
-- Plano: docs/planos/2026-08-09-fechar-lacunas-medicao.md
--
-- Fecha as lacunas que impediam aposentar o Medição Inteligente. A que manda é
-- a primeira: um levantamento percorre térreo, cobertura, corte e fachada, e
-- hoje só cabe UM fundo por nível.
--
-- ⚠️ FK PARA TABELA EM USO DEADLOCKA — e não é só `auth.users`. A 000013 deu
--    `40P01` porque `blueprint_studies` estava quente com o editor aberto no
--    navegador. Por isso a FK do bloco 3 fica sozinha: FECHE A ABA DO EDITOR
--    antes dele.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — a prancha deixa de ser única por nível ═══════════════════════
-- `nome` e `ordem` existem para a pessoa saber qual prancha é qual. Sem eles a
-- lista vira "planta.pdf, planta.pdf, planta.pdf".
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_underlays
  DROP CONSTRAINT IF EXISTS blueprint_underlay_unico;

ALTER TABLE public.blueprint_underlays
  ADD COLUMN IF NOT EXISTS nome  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

-- Prancha sem nome recebe o do arquivo, para a lista nascer legível.
UPDATE public.blueprint_underlays
   SET nome = COALESCE(NULLIF(nome, ''), NULLIF(nome_arquivo, ''), 'Prancha');

COMMENT ON TABLE public.blueprint_underlays IS
  'Pranchas de fundo para traçado manual. VÁRIAS por estudo: um levantamento '
  'percorre térreo, cobertura, corte e fachada. Cada uma tem a própria aferição, '
  'e recalibrar uma NÃO mexe nas formas traçadas nas outras.';

-- ═══ BLOCO 2 — a medição aponta para a prancha ══════════════════════════════
-- Sem isto, mostrar a prancha B exibiria as formas traçadas na A — em
-- coordenadas que só fazem sentido sob a calibração da A. E recalibrar B
-- transformaria as formas de A junto, que é o defeito latente de hoje.
--
-- Nulo é permitido: forma traçada sem prancha nenhuma continua válida.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_measurements
  ADD COLUMN IF NOT EXISTS underlay_id UUID,
  -- Camada é CAMPO, não tabela. A lista sai dos valores distintos, e
  -- visibilidade/bloqueio ficam no estado da tela: são preferência de quem
  -- olha, não do levantamento.
  ADD COLUMN IF NOT EXISTS camada TEXT NOT NULL DEFAULT 'Geral',
  -- Item FORA do catálogo: nome e preço arbitrados pela pessoa.
  ADD COLUMN IF NOT EXISTS item_nome  TEXT,
  ADD COLUMN IF NOT EXISTS item_preco NUMERIC(14,4);

CREATE INDEX IF NOT EXISTS idx_blueprint_medicao_prancha
    ON public.blueprint_measurements(underlay_id);

COMMENT ON COLUMN public.blueprint_measurements.item_nome IS
  'Item arbitrado, quando não há código de catálogo. O código que vai ao '
  'orçamento é DERIVADO deste nome, nunca aleatório — o Medição gera '
  'MED-{4 dígitos} e por isso duplica linha a cada exportação.';

-- ═══ BLOCO 3 — a FK da prancha, SOZINHA ═════════════════════════════════════
-- ⚠️ FECHE A ABA DO EDITOR DE PLANTAS ANTES. Precisa de lock em
--    `blueprint_underlays`. Se der 40P01, o `lock_timeout` aborta sem estragar
--    nada — repita com o app fechado.
--
-- `ON DELETE SET NULL`, e não CASCADE: apagar a prancha não pode apagar o
-- levantamento feito sobre ela. A forma continua existindo, com a medida que
-- tinha; o que se perde é a referência ao documento.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_measurements
  DROP CONSTRAINT IF EXISTS blueprint_medicao_prancha_fk;

ALTER TABLE public.blueprint_measurements
  ADD CONSTRAINT blueprint_medicao_prancha_fk
  FOREIGN KEY (underlay_id)
  REFERENCES public.blueprint_underlays(id) ON DELETE SET NULL;

-- ═══ BLOCO 4 — ligar as medições existentes à prancha do nível ══════════════
-- Antes de haver várias, só havia uma por nível: a associação é inequívoca.
SET lock_timeout = '5s';

UPDATE public.blueprint_measurements m
   SET underlay_id = u.id
  FROM public.blueprint_underlays u
 WHERE m.underlay_id IS NULL
   AND u.study_id = m.study_id
   AND (u.level_id IS NOT DISTINCT FROM m.level_id);

-- ═══ BLOCO 5 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: sem_unico=1, colunas=5, fk_prancha=1, orfas=0
--
-- `orfas` conta medições que não acharam prancha. Maior que zero significa
-- forma traçada sem fundo — o que é permitido, mas vale conferir.

SELECT
  (SELECT count(*) = 0 FROM pg_constraint
    WHERE conname = 'blueprint_underlay_unico')::int                              AS sem_unico,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='blueprint_underlays' AND column_name IN ('nome','ordem'))
        OR (table_name='blueprint_measurements'
            AND column_name IN ('underlay_id','camada','item_nome'))))            AS colunas,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='blueprint_medicao_prancha_fk')                                 AS fk_prancha,
  (SELECT count(*) FROM public.blueprint_measurements
    WHERE underlay_id IS NULL)                                                    AS orfas;
