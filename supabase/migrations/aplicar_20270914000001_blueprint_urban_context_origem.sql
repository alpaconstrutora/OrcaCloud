-- ============================================================================
-- Planta Inteligente — de QUAL das duas bases a zona veio
--
-- `blueprint_study_urban_context.regulatory_zone_id` (migration 20270914000000)
-- nasceu apontando só para `empreendimento_regulatory_zones`. O estudo que não
-- tem empreendimento nenhum ficava sem caminho — e é o caso comum de quem abre
-- a Planta Inteligente antes de cadastrar a incorporação.
--
-- Com a busca direta no catálogo da cidade (`regulatory_map_zones`), o mesmo
-- `regulatory_zone_id` passa a poder apontar para DUAS tabelas. Sem dizer qual,
-- não há como reler a zona para detectar que ela mudou: procurar na tabela
-- errada devolve "não achei", e o código lê isso como "zona apagada" — silencioso
-- e errado.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. NUNCA `supabase db push`.
-- ⚠️ Aditiva e toda anulável: linha que já existe continua válida e é lida como
--    EMPREENDIMENTO, que é o que ela é.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_urban_context
    ADD COLUMN IF NOT EXISTS zona_origem TEXT
        CHECK (zona_origem IS NULL OR zona_origem IN ('EMPREENDIMENTO', 'CATALOGO')),
    -- Só faz sentido com origem CATALOGO: é por ele que se recarrega a zona do
    -- mapa da cidade para conferir se a lei mudou. Sem FK, pelo mesmo motivo do
    -- resto da tabela — apagar o mapa não pode derrubar o estudo.
    ADD COLUMN IF NOT EXISTS regulatory_map_id UUID;

COMMENT ON COLUMN public.blueprint_study_urban_context.zona_origem IS
  'EMPREENDIMENTO (empreendimento_regulatory_zones) ou CATALOGO '
  '(regulatory_map_zones). Diz em qual tabela procurar regulatory_zone_id. '
  'NULL em linha anterior a 20270914000001 — lida como EMPREENDIMENTO.';

-- Linhas já gravadas vieram todas do empreendimento: à época era o único caminho.
UPDATE public.blueprint_study_urban_context
   SET zona_origem = 'EMPREENDIMENTO'
 WHERE zona_origem IS NULL
   AND regulatory_zone_id IS NOT NULL;

RESET lock_timeout;
