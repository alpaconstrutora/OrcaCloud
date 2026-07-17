-- migration: 20270218000001_regulatory_zones_planta_fields.sql
--
-- Mapa Regulatório unificado: o mapa compartilhado (imovib_regulatory_zones, mostrado no
-- Empreendimento, na Viabilidade e agora na Planta) ganha TODOS os campos que existiam só no
-- ruleset urbanístico da Planta (plant_urban_rulesets). A ideia é que toda informação
-- regulatória esteja disponível em um lugar só, para todos os módulos — use quem usar.
--
-- Colunas TEXT (como as já existentes ca_*/taxa_*), para o mesmo tratamento da UI (aceita
-- "N.A.", vírgula decimal, texto livre). Sem FK, sem DEFAULT: ADD COLUMN vira operação
-- metadata-only no Postgres (não reescreve a tabela, lock brevíssimo) — não é o caso de
-- deadlock das FKs/views. ALTER único: uma só aquisição de lock.

ALTER TABLE public.imovib_regulatory_zones
    ADD COLUMN IF NOT EXISTS uso_permitido           TEXT,   -- allowed_use
    ADD COLUMN IF NOT EXISTS recuo_frente            TEXT,   -- front_setback (m)
    ADD COLUMN IF NOT EXISTS recuo_lateral_direita   TEXT,   -- right_setback (m)
    ADD COLUMN IF NOT EXISTS recuo_lateral_esquerda  TEXT,   -- left_setback (m)
    ADD COLUMN IF NOT EXISTS recuo_fundos            TEXT,   -- rear_setback (m)
    ADD COLUMN IF NOT EXISTS gabarito_pavimentos     TEXT,   -- max_floors (nº de pavimentos; distinto do gabarito em metros)
    ADD COLUMN IF NOT EXISTS regra_vagas             TEXT,   -- parking_rule_type
    ADD COLUMN IF NOT EXISTS vagas_por_unidade       TEXT,   -- parking_spaces_per_unit
    ADD COLUMN IF NOT EXISTS area_minima_unidade     TEXT,   -- min_unit_area (m²)
    ADD COLUMN IF NOT EXISTS lei_referencia          TEXT,   -- law_reference
    ADD COLUMN IF NOT EXISTS documento_fonte         TEXT,   -- source_document
    ADD COLUMN IF NOT EXISTS nivel_confianca         TEXT,   -- confidence_level
    ADD COLUMN IF NOT EXISTS observacoes             TEXT;   -- notes
