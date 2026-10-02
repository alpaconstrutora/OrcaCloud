-- ─────────────────────────────────────────────────────────────────────────────
-- ESTUDO DE MASSA → EMPREENDIMENTO (02/10/2026, fase M3)
--
-- Plano `docs/planos/2026-10-01-estudo-de-massa.md`. O cenário de massa da
-- Planta Inteligente vira cadastro, pelo motor de sync que já existe
-- (`services/sync/`), como origem nova `massa`:
--
--   BLOCO de massa → empreendimento_towers (pavimentos, un/pav, custo e preço/m²)
--   UNIDADE do produto distribuído → empreendimento_units (placeholder)
--
-- ⚠️ O bloco é ligado pelo `uid` do payload canônico (nunca pelo id do kernel,
-- que é reatribuído a cada carregamento). A unidade da massa NÃO existe no
-- desenho: é derivada (bloco × pavimento × posição), então a chave é um TEXTO
-- determinístico "uid-do-bloco:pavimento:posição". Mudar o mix renumera — as
-- unidades que sumirem viram órfãs REPORTADAS, nunca apagadas (regra do motor).
--
-- Tudo ADITIVO: duas colunas anuláveis, dois índices parciais, dois CHECKs
-- ampliados. Sem FK (o padrão do módulo: FK para tabela quente deadlocka e
-- prende o apagar do estudo). Sem policy nem função nova — as colunas herdam as
-- policies das tabelas.
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
-- ─────────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE public.empreendimento_towers
  ADD COLUMN IF NOT EXISTS blueprint_bloco_uid UUID;
COMMENT ON COLUMN public.empreendimento_towers.blueprint_bloco_uid IS
  'uid do Bloco de massa no payload canônico do estudo da Planta Inteligente (Estudo de Massa). uid, não id.';

ALTER TABLE public.empreendimento_units
  ADD COLUMN IF NOT EXISTS blueprint_massa_chave TEXT;
COMMENT ON COLUMN public.empreendimento_units.blueprint_massa_chave IS
  'Chave da unidade derivada do Estudo de Massa: "<uid do bloco>:<pavimento>:<posição>". Placeholder, não desenho.';

CREATE UNIQUE INDEX IF NOT EXISTS empr_towers_blueprint_bloco_uidx
  ON public.empreendimento_towers (empreendimento_id, blueprint_bloco_uid)
  WHERE blueprint_bloco_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS empr_units_blueprint_massa_uidx
  ON public.empreendimento_units (tower_id, blueprint_massa_chave)
  WHERE blueprint_massa_chave IS NOT NULL;

-- Os dois CHECK fechados que a origem nova encontraria (a lição da B3: sem eles,
-- tudo passa no caminho feliz e quebra no PRIMEIRO conflito real a curar).
ALTER TABLE public.empreendimento_field_proposals
  DROP CONSTRAINT IF EXISTS empreendimento_field_proposals_origin_check;
ALTER TABLE public.empreendimento_field_proposals
  ADD CONSTRAINT empreendimento_field_proposals_origin_check
  CHECK (origin IN ('imovib', 'planta_ai', 'blueprint', 'massa'));

ALTER TABLE public.empreendimento_audit_logs
  DROP CONSTRAINT IF EXISTS empreendimento_audit_logs_source_check;
ALTER TABLE public.empreendimento_audit_logs
  ADD CONSTRAINT empreendimento_audit_logs_source_check
  CHECK (source IN ('app', 'sync_imovib', 'sync_planta', 'sync_blueprint', 'sync_massa', 'curadoria', 'comercial', 'locacao', 'area_engine'));

COMMIT;
