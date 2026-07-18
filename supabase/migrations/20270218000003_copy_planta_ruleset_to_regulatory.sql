-- migration: 20270218000003_copy_planta_ruleset_to_regulatory.sql
--
-- Traz os dados já preenchidos no ruleset urbanístico da Planta (plant_urban_rulesets) para o
-- Mapa Regulatório compartilhado (empreendimento_regulatory_zones). Assim toda informação
-- regulatória que existia só na Planta passa a estar disponível em todos os módulos.
--
-- Dois casos, ambos NÃO-destrutivos e idempotentes:
--   1) Empreendimento com Planta e SEM zonas → cria uma zona a partir do ruleset.
--   2) Empreendimento que JÁ tem zonas (ex: veio do Imovib) → preenche só os campos VAZIOS da
--      primeira zona com os valores do ruleset (COALESCE nunca sobrescreve o que já existe).
--
-- Numéricos do ruleset viram TEXT em formato BR (vírgula), como o resto do mapa. NULLIF(...,0)
-- evita trazer zeros "não preenchidos" como se fossem dado.

-- Helpers de conversão inline: num BR e texto não-vazio.
-- (não há função criada; expresso direto no SQL abaixo)

-- ── Caso 1: empreendimento com Planta e sem nenhuma zona ─────────────────────
INSERT INTO public.empreendimento_regulatory_zones (
    empreendimento_id, organization_id,
    zona, uso_permitido, taxa_ocupacao_maxima, ca_basico, ca_maximo, taxa_permeabilidade_minima,
    recuo_frente, recuo_fundos, recuo_lateral_direita, recuo_lateral_esquerda,
    gabarito_pavimentos, gabarito_altura_maxima, regra_vagas, vagas_por_unidade,
    area_minima_unidade, lei_referencia, documento_fonte, nivel_confianca, observacoes
)
SELECT
    e.id, e.organization_id,
    NULLIF(r.zone_name, ''),
    NULLIF(r.allowed_use, ''),
    replace(NULLIF(r.occupancy_rate, 0)::text, '.', ','),
    replace(NULLIF(r.floor_area_ratio_basic, 0)::text, '.', ','),
    replace(NULLIF(r.floor_area_ratio_max, 0)::text, '.', ','),
    replace(NULLIF(r.permeability_rate, 0)::text, '.', ','),
    replace(NULLIF(r.front_setback, 0)::text, '.', ','),
    replace(NULLIF(r.rear_setback, 0)::text, '.', ','),
    replace(NULLIF(r.right_setback, 0)::text, '.', ','),
    replace(NULLIF(r.left_setback, 0)::text, '.', ','),
    replace(NULLIF(r.max_floors, 0)::text, '.', ','),
    replace(NULLIF(r.max_height, 0)::text, '.', ','),
    NULLIF(r.parking_rule_type, ''),
    replace(NULLIF(r.parking_spaces_per_unit, 0)::text, '.', ','),
    replace(NULLIF(r.min_unit_area, 0)::text, '.', ','),
    NULLIF(r.law_reference, ''),
    NULLIF(r.source_document, ''),
    NULLIF(r.confidence_level, ''),
    NULLIF(r.notes, '')
FROM public.plant_urban_rulesets r
JOIN public.empreendimentos e ON e.planta_ai_study_id = r.study_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.empreendimento_regulatory_zones z WHERE z.empreendimento_id = e.id
);

-- ── Caso 2: empreendimento que já tem zonas → preenche só os campos vazios da 1ª zona ───────
UPDATE public.empreendimento_regulatory_zones z
SET
    zona                       = COALESCE(NULLIF(z.zona, ''),                       NULLIF(r.zone_name, '')),
    uso_permitido              = COALESCE(NULLIF(z.uso_permitido, ''),              NULLIF(r.allowed_use, '')),
    taxa_ocupacao_maxima       = COALESCE(NULLIF(z.taxa_ocupacao_maxima, ''),       replace(NULLIF(r.occupancy_rate, 0)::text, '.', ',')),
    ca_basico                  = COALESCE(NULLIF(z.ca_basico, ''),                  replace(NULLIF(r.floor_area_ratio_basic, 0)::text, '.', ',')),
    ca_maximo                  = COALESCE(NULLIF(z.ca_maximo, ''),                  replace(NULLIF(r.floor_area_ratio_max, 0)::text, '.', ',')),
    taxa_permeabilidade_minima = COALESCE(NULLIF(z.taxa_permeabilidade_minima, ''), replace(NULLIF(r.permeability_rate, 0)::text, '.', ',')),
    recuo_frente               = COALESCE(NULLIF(z.recuo_frente, ''),               replace(NULLIF(r.front_setback, 0)::text, '.', ',')),
    recuo_fundos               = COALESCE(NULLIF(z.recuo_fundos, ''),               replace(NULLIF(r.rear_setback, 0)::text, '.', ',')),
    recuo_lateral_direita      = COALESCE(NULLIF(z.recuo_lateral_direita, ''),      replace(NULLIF(r.right_setback, 0)::text, '.', ',')),
    recuo_lateral_esquerda     = COALESCE(NULLIF(z.recuo_lateral_esquerda, ''),     replace(NULLIF(r.left_setback, 0)::text, '.', ',')),
    gabarito_pavimentos        = COALESCE(NULLIF(z.gabarito_pavimentos, ''),        replace(NULLIF(r.max_floors, 0)::text, '.', ',')),
    gabarito_altura_maxima     = COALESCE(NULLIF(z.gabarito_altura_maxima, ''),     replace(NULLIF(r.max_height, 0)::text, '.', ',')),
    regra_vagas                = COALESCE(NULLIF(z.regra_vagas, ''),                NULLIF(r.parking_rule_type, '')),
    vagas_por_unidade          = COALESCE(NULLIF(z.vagas_por_unidade, ''),          replace(NULLIF(r.parking_spaces_per_unit, 0)::text, '.', ',')),
    area_minima_unidade        = COALESCE(NULLIF(z.area_minima_unidade, ''),        replace(NULLIF(r.min_unit_area, 0)::text, '.', ',')),
    lei_referencia             = COALESCE(NULLIF(z.lei_referencia, ''),             NULLIF(r.law_reference, '')),
    documento_fonte            = COALESCE(NULLIF(z.documento_fonte, ''),            NULLIF(r.source_document, '')),
    nivel_confianca            = COALESCE(NULLIF(z.nivel_confianca, ''),            NULLIF(r.confidence_level, '')),
    observacoes                = COALESCE(NULLIF(z.observacoes, ''),                NULLIF(r.notes, '')),
    updated_at                 = now()
FROM public.plant_urban_rulesets r
JOIN public.empreendimentos e ON e.planta_ai_study_id = r.study_id
WHERE z.empreendimento_id = e.id
  -- só a primeira zona do empreendimento (evita espalhar o ruleset por todas)
  AND z.id = (
      SELECT z2.id FROM public.empreendimento_regulatory_zones z2
      WHERE z2.empreendimento_id = e.id
      ORDER BY z2.created_at, z2.id
      LIMIT 1
  );
