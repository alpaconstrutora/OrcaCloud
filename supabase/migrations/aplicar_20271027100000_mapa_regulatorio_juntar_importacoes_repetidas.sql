-- ============================================================================
-- Mapa Regulatório: junta as importações repetidas da mesma tabela (26/10/2026)
-- Plano: docs/planos/2026-10-26-zona-aplicavel-chega-na-planta.md
-- ============================================================================
-- O mapa "Plano Diretor" de Cambuí-MG recebeu a TABELA 1 da LC 12/2020 TRÊS vezes
-- (19 e 20/07/2026: a 1ª leitura não trouxe T.O./T.P.; a 2ª e a 3ª trouxeram) e
-- ficou com 175 linhas para 59 zonas × macroárea. O empreendimento 011 - Garden
-- Cambuhy importou o mapa inteiro (#190) e herdou a repetição: a zona marcada como
-- aplicável (ZEPEC 2 · Urbanização Consolidada) é a cópia SEM T.O. e T.P. — os
-- valores estavam nas irmãs —, e a Planta aplicava a zona sem esses limites.
--
-- O que faz, nas duas tabelas (catálogo e cópias dos empreendimentos), por dono
-- (mapa ou empreendimento) e zona × macroárea com mais de uma linha:
--   1. Grupo com valores DIFERENTES num mesmo campo NÃO é tocado (é a lei que
--      precisa ser lida — hoje só ZC · Urbanização Consolidada: T.O. 0,7 × 0,9).
--   2. Fica uma linha: a marcada como aplicável; senão a que alguma planta usa;
--      senão a de menor ordem. Os campos vazios dela recebem o valor das irmãs.
--   3. Planta que apontava para uma irmã passa a apontar para a que ficou.
--   4. As irmãs são apagadas — copiadas antes para `arquivo_mapa_regulatorio`
--      (fora da API). Apagar a cópia é decisão do usuário, depois.
-- Reexecutar não faz nada: depois da 1ª vez não há grupo repetido sem conflito.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS arquivo_mapa_regulatorio;
REVOKE ALL ON SCHEMA arquivo_mapa_regulatorio FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS arquivo_mapa_regulatorio.regulatory_map_zones_20271027
  AS SELECT * FROM public.regulatory_map_zones WITH NO DATA;
CREATE TABLE IF NOT EXISTS arquivo_mapa_regulatorio.empreendimento_regulatory_zones_20271027
  AS SELECT * FROM public.empreendimento_regulatory_zones WITH NO DATA;
CREATE TABLE IF NOT EXISTS arquivo_mapa_regulatorio.contexto_repontado_20271027 (
  study_id uuid, regulatory_zone_id_antes uuid, regulatory_zone_id_depois uuid, em timestamptz DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA arquivo_mapa_regulatorio FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  cols text[] := ARRAY[
    'ca_minimo','ca_basico','ca_maximo','taxa_ocupacao_maxima','taxa_permeabilidade_minima',
    'gabarito_altura_maxima','uso_permitido','recuo_frente','recuo_fundos','recuo_lateral_direita',
    'recuo_lateral_esquerda','gabarito_pavimentos','regra_vagas','vagas_por_unidade','area_minima_unidade',
    'lei_referencia','documento_fonte','nivel_confianca','observacoes','testada_minima','area_minima_lote',
    'insolacao_minima','afastamento_progressivo','recuo_frente_escalonado'];
  t record;
  g record;
  c text;
  n int;
  conflito text;
  fica uuid;
  sets text;
  juntados int;
  pulados int;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('regulatory_map_zones', 'regulatory_map_id', ''),
      ('empreendimento_regulatory_zones', 'empreendimento_id', 'aplicavel DESC,')) v(tabela, dono, prioridade)
  LOOP
    juntados := 0;
    pulados := 0;
    FOR g IN EXECUTE format(
      $q$SELECT %1$I AS dono, coalesce(zona, '') AS zona, coalesce(macroarea, '') AS macroarea,
                array_agg(id ORDER BY %2$s
                  (EXISTS (SELECT 1 FROM public.blueprint_study_urban_context u WHERE u.regulatory_zone_id = z.id)) DESC,
                  sort_order, created_at) AS ids
           FROM public.%3$I z GROUP BY 1, 2, 3 HAVING count(*) > 1$q$,
      t.dono, t.prioridade, t.tabela)
    LOOP
      conflito := NULL;
      FOREACH c IN ARRAY cols LOOP
        EXECUTE format('SELECT count(DISTINCT nullif(btrim(%I), %L)) FROM public.%I WHERE id = ANY($1)', c, '', t.tabela)
          INTO n USING g.ids;
        IF n > 1 THEN conflito := c; EXIT; END IF;
      END LOOP;
      IF conflito IS NOT NULL THEN
        RAISE NOTICE '% · % · % — % com valores diferentes: grupo NÃO juntado', t.tabela, g.zona, g.macroarea, conflito;
        pulados := pulados + 1;
        CONTINUE;
      END IF;

      fica := g.ids[1];

      EXECUTE format('INSERT INTO arquivo_mapa_regulatorio.%I SELECT * FROM public.%I WHERE id = ANY($1)',
                     t.tabela || '_20271027', t.tabela) USING g.ids;

      SELECT string_agg(format(
        '%1$I = CASE WHEN nullif(btrim(s.%1$I), %2$L) IS NULL THEN (SELECT max(nullif(btrim(o.%1$I), %2$L)) FROM public.%3$I o WHERE o.id = ANY($1)) ELSE s.%1$I END',
        x, '', t.tabela), ', ')
        INTO sets FROM unnest(cols) x;
      EXECUTE format('UPDATE public.%I s SET %s WHERE s.id = $2', t.tabela, sets) USING g.ids, fica;

      INSERT INTO arquivo_mapa_regulatorio.contexto_repontado_20271027 (study_id, regulatory_zone_id_antes, regulatory_zone_id_depois)
        SELECT study_id, regulatory_zone_id, fica FROM public.blueprint_study_urban_context
         WHERE regulatory_zone_id = ANY(g.ids) AND regulatory_zone_id <> fica;
      UPDATE public.blueprint_study_urban_context SET regulatory_zone_id = fica
       WHERE regulatory_zone_id = ANY(g.ids) AND regulatory_zone_id <> fica;

      EXECUTE format('DELETE FROM public.%I WHERE id = ANY($1) AND id <> $2', t.tabela) USING g.ids, fica;
      juntados := juntados + 1;
    END LOOP;
    RAISE NOTICE '%: % grupos juntados, % pulados por conflito', t.tabela, juntados, pulados;
  END LOOP;
END $$;

COMMIT;
