-- ─────────────────────────────────────────────────────────────────────────────
-- LOTEAMENTO → EMPREENDIMENTO (fase B3, 25/09/2026)
--
-- O que esta migration faz: dá ao cadastro de empreendimentos o vocabulário do
-- parcelamento do solo, para que o loteamento desenhado na Planta Inteligente
-- chegue ao espelho de vendas, à tabela de preços e ao portal do corretor SEM
-- código novo nessas telas.
--
-- O mapeamento, e por que ele é este:
--   QUADRA → empreendimento_towers   (a unidade exige `tower_id`; quadra é o
--                                     agrupador natural, como a torre)
--   LOTE   → empreendimento_units    (é o que se vende, e é onde o comercial
--                                     inteiro já está ligado por trigger)
--
-- ⚠️ O vínculo com o desenho é pelo `uid`, NUNCA pelo id do kernel:
-- `modelFromCanonicalPayload` reatribui os ids a cada carregamento do payload,
-- então um vínculo por id trocaria de dono em silêncio. O `uid` é estável.
--
-- Tudo aqui é ADITIVO: colunas novas e anuláveis, um seed e dois índices
-- parciais. Nenhum DROP, nenhuma linha existente alterada. As colunas herdam as
-- policies das tabelas, que já são org-scoped — não há policy nem função nova.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. O tipo de empreendimento "Loteamento" ─────────────────────────────────
-- Entra como as outras cinco linhas de sistema: `organization_id NULL`,
-- `is_system = true`, slug em caixa alta. A categoria é `horizontal` — é o que
-- o motor NBR 12721 usa para empreendimento que não empilha pavimentos, e o
-- CHECK de `motor_category` só aceita vertical|horizontal|mixed|commercial.
INSERT INTO public.empreendimento_types (name, slug, motor_category, color, description, is_system, active, sort_order)
SELECT 'Loteamento', 'LOTEAMENTO', 'horizontal', '#16a34a',
       'Parcelamento do solo (Lei 6.766/79): quadras e lotes, com vias e áreas públicas.',
       true, true,
       COALESCE((SELECT MAX(sort_order) FROM public.empreendimento_types WHERE is_system), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.empreendimento_types WHERE slug = 'LOTEAMENTO' AND organization_id IS NULL
);

-- ── 2. O empreendimento aponta o estudo da Planta Inteligente ────────────────
-- Espelho de `planta_ai_study_id`, e pelo mesmo motivo SEM foreign key: o
-- estudo e o empreendimento são editados por telas diferentes, e uma FK aqui
-- faria apagar um estudo travar no empreendimento.
ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS blueprint_study_id UUID;

COMMENT ON COLUMN public.empreendimentos.blueprint_study_id IS
  'Estudo da Planta Inteligente que originou este empreendimento (loteamento). Sem FK, como planta_ai_study_id.';

-- ── 3. Proveniência: a quadra e o lote do desenho ────────────────────────────
ALTER TABLE public.empreendimento_towers
  ADD COLUMN IF NOT EXISTS blueprint_quadra_uid UUID;

COMMENT ON COLUMN public.empreendimento_towers.blueprint_quadra_uid IS
  'uid da Quadra no payload canônico do estudo. uid, não id: o id é reatribuído a cada carregamento.';

ALTER TABLE public.empreendimento_units
  ADD COLUMN IF NOT EXISTS blueprint_lote_uid UUID;

COMMENT ON COLUMN public.empreendimento_units.blueprint_lote_uid IS
  'uid do Lote no payload canônico do estudo. uid, não id.';

-- ── 4. O vocabulário do lote na unidade ──────────────────────────────────────
-- `quadra` e `lote` são TEXTO porque é assim que o memorial e a matrícula os
-- escrevem ("Quadra A, Lote 12-A"): número puro perderia o "12-A".
ALTER TABLE public.empreendimento_units
  ADD COLUMN IF NOT EXISTS quadra TEXT,
  ADD COLUMN IF NOT EXISTS lote TEXT,
  ADD COLUMN IF NOT EXISTS testada_m NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS confrontantes JSONB;

COMMENT ON COLUMN public.empreendimento_units.quadra IS 'Quadra do lote, como no memorial ("A", "01").';
COMMENT ON COLUMN public.empreendimento_units.lote IS 'Número do lote, como no memorial ("12", "12-A").';
COMMENT ON COLUMN public.empreendimento_units.testada_m IS 'Testada (frente) em metros, derivada do desenho.';
COMMENT ON COLUMN public.empreendimento_units.confrontantes IS
  'Lados do lote com papel e confrontante, derivados do desenho: [{papel, confrontante, comprimentoM}].';

-- ── 5. Um lote do desenho = uma unidade ──────────────────────────────────────
-- Índice parcial único, no molde de `empr_units_instance_uidx`: sem o WHERE,
-- todas as unidades sem proveniência colidiriam entre si no NULL.
CREATE UNIQUE INDEX IF NOT EXISTS empr_units_blueprint_lote_uidx
  ON public.empreendimento_units (tower_id, blueprint_lote_uid)
  WHERE blueprint_lote_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS empr_towers_blueprint_quadra_uidx
  ON public.empreendimento_towers (empreendimento_id, blueprint_quadra_uid)
  WHERE blueprint_quadra_uid IS NOT NULL;

-- Busca do empreendimento pelo estudo, no caminho do sync.
CREATE INDEX IF NOT EXISTS empreendimentos_blueprint_study_idx
  ON public.empreendimentos (blueprint_study_id)
  WHERE blueprint_study_id IS NOT NULL;

-- ── 6. Os dois CHECK fechados que a origem nova encontraria ──────────────────
-- ⚠️ Sem estes dois ALTER, a fase inteira passa nos testes e QUEBRA no primeiro
-- conflito real: `materializeConflicts` grava `origin` em
-- `empreendimento_field_proposals` (CHECK aceitava só imovib|planta_ai) e o
-- sync grava `source` em `empreendimento_audit_logs` (CHECK sem sync_blueprint).
-- Nenhum dos dois aparece no caminho feliz — só quando há divergência para
-- curar, que é exatamente quando o usuário mais precisa que funcione.
ALTER TABLE public.empreendimento_field_proposals
  DROP CONSTRAINT IF EXISTS empreendimento_field_proposals_origin_check;
ALTER TABLE public.empreendimento_field_proposals
  ADD CONSTRAINT empreendimento_field_proposals_origin_check
  CHECK (origin IN ('imovib', 'planta_ai', 'blueprint'));

ALTER TABLE public.empreendimento_audit_logs
  DROP CONSTRAINT IF EXISTS empreendimento_audit_logs_source_check;
ALTER TABLE public.empreendimento_audit_logs
  ADD CONSTRAINT empreendimento_audit_logs_source_check
  CHECK (source IN ('app', 'sync_imovib', 'sync_planta', 'sync_blueprint', 'curadoria', 'comercial', 'locacao', 'area_engine'));

COMMIT;
