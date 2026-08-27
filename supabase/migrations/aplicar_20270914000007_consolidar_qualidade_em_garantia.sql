-- ============================================================================
-- Consolidação: "Qualidade & Entrega" → "Pós-Obra & Garantia"
-- OrçaCloud SaaS · aplicar_20270914000007
-- Plano: docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md
--
-- CONTEXTO
-- O módulo Qualidade (20260514000000) é a origem da qual o módulo Garantia
-- (20260708000000) foi clonado — a própria migration de Garantia diz isso na
-- linha 4. Os dois modelam a mesma coisa (defeito num ativo → responsabilidade
-- → reparo → encerramento) sem nenhuma ligação entre si, e o de Qualidade nunca
-- funcionou: as tabelas de taxonomia nasceram SEM SEED, e `classify_condition`
-- valida `pathologyCode` contra elas, então toda condição fica presa em
-- DETECTED para sempre.
--
-- O QUE ESTA MIGRATION FAZ
--   1. Semeia a taxonomia controlada (12 sistemas, 48 patologias).
--   2. Liga sistema → prazo de garantia NBR 17170.
--   3. Leva para `warranty_claims` as colunas que só existiam em condições.
--   4. Calcula `quality_score` do chamado por trigger.
--   5. Migra as condições existentes para chamados (idempotente).
--   6. Marca as tabelas `condition_*` como legado.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--   Não dropa nada. As 9 tabelas `condition_*`, suas RPCs, suas policies e o
--   bucket `condition-evidence` continuam existindo. A consolidação é
--   reversível restaurando a rota e o item de menu no front.
--
-- APLICAÇÃO: SQL direto no editor do Supabase. NUNCA `supabase db push` —
-- o histórico de `schema_migrations` deste projeto está furado.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Sistema construtivo → prazo de garantia
--    Faz o vocabulário de Qualidade e o de Garantia convergirem: escolher
--    "Hidrossanitário" passa a sugerir o prazo de 24 meses de INSTALACOES.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.condition_taxonomy_systems
  ADD COLUMN IF NOT EXISTS warranty_term_code TEXT
    REFERENCES public.warranty_terms(code) ON DELETE SET NULL;

COMMENT ON COLUMN public.condition_taxonomy_systems.warranty_term_code IS
  'Prazo de garantia NBR 17170 sugerido ao escolher este sistema. Sugestão, não trava.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SEED DA TAXONOMIA — a peça que faltava desde 2026-05-14
--    Sem isto, `classify_condition` sempre estoura P0004 e o módulo trava.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.condition_taxonomy_systems (code, name, norm_ref, warranty_term_code) VALUES
  ('EST', 'Estrutura e fundação',          'NBR 6118, NBR 6122',        'ESTRUTURA'),
  ('IMP', 'Impermeabilização',             'NBR 9575, NBR 9574',        'IMPERMEABILIZACAO'),
  ('VED', 'Vedação vertical (alvenaria)',  'NBR 15575-4, NBR 8545',     'VEDACAO'),
  ('REV', 'Revestimento de paredes e pisos','NBR 13749, NBR 13755',     'REVESTIMENTO'),
  ('COB', 'Cobertura e telhado',           'NBR 15575-5, NBR 8039',     'COBERTURA'),
  ('HID', 'Instalação hidrossanitária',    'NBR 5626, NBR 8160',        'INSTALACOES'),
  ('ELE', 'Instalação elétrica',           'NBR 5410, NBR 5419',        'INSTALACOES'),
  ('GAS', 'Instalação de gás',             'NBR 13103, NBR 15526',      'INSTALACOES'),
  ('ESQ', 'Esquadrias e vidros',           'NBR 10821, NBR 7199',       'ACABAMENTO'),
  ('PIN', 'Pintura',                       'NBR 13245',                 'PINTURA'),
  ('ACA', 'Acabamentos (louças, metais, portas)', 'NBR 15575-1',        'ACABAMENTO'),
  ('EQP', 'Equipamentos industrializados', 'NBR 15575-1',               'EQUIPAMENTOS')
ON CONFLICT (code) DO UPDATE
  SET name               = EXCLUDED.name,
      norm_ref           = EXCLUDED.norm_ref,
      warranty_term_code = EXCLUDED.warranty_term_code,
      active             = true;

INSERT INTO public.condition_taxonomy_pathologies (code, name, system_code, definition, norm_ref) VALUES
  -- Estrutura
  ('EST.FIS', 'Fissura em elemento estrutural', 'EST', 'Abertura menor que 0,5 mm em viga, pilar ou laje.', 'NBR 6118'),
  ('EST.TRI', 'Trinca ou rachadura estrutural', 'EST', 'Abertura acima de 0,5 mm, com possível perda de capacidade.', 'NBR 6118'),
  ('EST.COR', 'Corrosão de armadura',           'EST', 'Oxidação de aço exposto, com destacamento do cobrimento.', 'NBR 6118'),
  ('EST.NIN', 'Ninho de concretagem',           'EST', 'Falha de adensamento com vazios no concreto.', 'NBR 14931'),
  ('EST.DEF', 'Deformação excessiva',           'EST', 'Flecha ou desaprumo acima do limite normativo.', 'NBR 6118'),
  ('EST.REC', 'Recalque de fundação',           'EST', 'Deslocamento vertical diferencial da fundação.', 'NBR 6122'),
  -- Impermeabilização
  ('IMP.INF', 'Infiltração por laje ou piso',   'IMP', 'Passagem de água através de superfície impermeabilizada.', 'NBR 9575'),
  ('IMP.BOL', 'Bolha ou descolamento da manta', 'IMP', 'Perda de aderência do sistema impermeabilizante.', 'NBR 9574'),
  ('IMP.ROD', 'Falha em rodapé ou arremate',    'IMP', 'Impermeabilização interrompida em subida de parede ou ralo.', 'NBR 9575'),
  ('IMP.RES', 'Vazamento em reservatório',      'IMP', 'Perda de água por caixa d''água, piscina ou cisterna.', 'NBR 9575'),
  -- Vedação
  ('VED.FIS', 'Fissura em alvenaria',           'VED', 'Abertura mapeada em pano de vedação.', 'NBR 15575-4'),
  ('VED.UMI', 'Umidade ascendente',             'VED', 'Migração de água do solo pela base da parede.', 'NBR 15575-4'),
  ('VED.DES', 'Descolamento entre alvenaria e estrutura', 'VED', 'Abertura na interface parede/pilar ou parede/viga.', 'NBR 8545'),
  ('VED.SON', 'Ruído aéreo acima do limite',    'VED', 'Desempenho acústico insuficiente da vedação.', 'NBR 15575-4'),
  -- Revestimento
  ('REV.DES', 'Descolamento de placa cerâmica', 'REV', 'Placa solta ou com som cavo à percussão.', 'NBR 13755'),
  ('REV.FIS', 'Fissuração do revestimento',     'REV', 'Fissura na argamassa ou na placa de revestimento.', 'NBR 13749'),
  ('REV.EFL', 'Eflorescência',                  'REV', 'Depósito salino esbranquiçado na superfície.', 'NBR 13749'),
  ('REV.REJ', 'Falha de rejunte',               'REV', 'Rejunte ausente, trincado ou desagregado.', 'NBR 13755'),
  ('REV.DPL', 'Desplacamento de fachada',       'REV', 'Queda de revestimento externo — risco a terceiros.', 'NBR 13755'),
  -- Cobertura
  ('COB.INF', 'Infiltração pela cobertura',     'COB', 'Entrada de água por telhado ou laje de cobertura.', 'NBR 15575-5'),
  ('COB.TEL', 'Telha quebrada ou deslocada',    'COB', 'Peça danificada ou fora de posição.', 'NBR 8039'),
  ('COB.CAL', 'Falha em calha, rufo ou condutor', 'COB', 'Vazamento ou transbordo do sistema de captação.', 'NBR 10844'),
  ('COB.EST', 'Deformação do madeiramento',     'COB', 'Flecha, apodrecimento ou ataque de xilófagos.', 'NBR 7190'),
  -- Hidrossanitário
  ('HID.VAZ', 'Vazamento em tubulação',         'HID', 'Perda de água em ramal de água fria, quente ou esgoto.', 'NBR 5626'),
  ('HID.ENT', 'Entupimento',                    'HID', 'Obstrução de ramal de esgoto ou de águas pluviais.', 'NBR 8160'),
  ('HID.PRE', 'Pressão ou vazão insuficiente',  'HID', 'Desempenho hidráulico abaixo do previsto em projeto.', 'NBR 5626'),
  ('HID.ODO', 'Odor ou retorno de esgoto',      'HID', 'Falha de fecho hídrico ou de ventilação da coluna.', 'NBR 8160'),
  -- Elétrico
  ('ELE.CUR', 'Curto-circuito',                 'ELE', 'Falha de isolamento com fechamento indevido de circuito.', 'NBR 5410'),
  ('ELE.DIS', 'Disjuntor desarmando',           'ELE', 'Atuação repetida da proteção sem sobrecarga aparente.', 'NBR 5410'),
  ('ELE.PON', 'Ponto sem energia',              'ELE', 'Tomada, interruptor ou luminária inoperante.', 'NBR 5410'),
  ('ELE.ATE', 'Falha de aterramento',           'ELE', 'Ausência ou continuidade insuficiente do condutor de proteção.', 'NBR 5410'),
  ('ELE.SPD', 'Falha no SPDA',                  'ELE', 'Sistema de proteção contra descargas atmosféricas comprometido.', 'NBR 5419'),
  -- Gás
  ('GAS.VAZ', 'Vazamento de gás',               'GAS', 'Escape em tubulação, registro ou conexão. Severidade mínima: crítica.', 'NBR 15526'),
  ('GAS.PRE', 'Pressão irregular',              'GAS', 'Regulagem fora da faixa de projeto.', 'NBR 13103'),
  ('GAS.VEN', 'Ventilação insuficiente do ambiente', 'GAS', 'Aberturas permanentes abaixo do mínimo normativo.', 'NBR 13103'),
  -- Esquadrias
  ('ESQ.INF', 'Infiltração por esquadria',      'ESQ', 'Entrada de água pelo contramarco ou pela junta.', 'NBR 10821'),
  ('ESQ.OPE', 'Falha de operação',              'ESQ', 'Folha emperrada, desalinhada ou com ferragem defeituosa.', 'NBR 10821'),
  ('ESQ.VED', 'Falha de vedação (borracha/escova)', 'ESQ', 'Perda de estanqueidade ao ar ou à água.', 'NBR 10821'),
  ('ESQ.VID', 'Vidro trincado ou mal fixado',   'ESQ', 'Peça danificada ou com falha de assentamento.', 'NBR 7199'),
  -- Pintura
  ('PIN.DES', 'Descascamento da pintura',       'PIN', 'Perda de aderência da película.', 'NBR 13245'),
  ('PIN.MAN', 'Manchamento',                    'PIN', 'Alteração localizada de cor ou brilho.', 'NBR 13245'),
  ('PIN.MOF', 'Mofo ou bolor',                  'PIN', 'Colonização por fungos sobre a pintura.', 'NBR 13245'),
  -- Acabamentos
  ('ACA.LOU', 'Louça trincada ou solta',        'ACA', 'Bacia, cuba ou tanque danificado ou mal fixado.', 'NBR 15097'),
  ('ACA.MET', 'Metal sanitário com vazamento',  'ACA', 'Torneira, registro ou válvula com perda de água.', 'NBR 15097'),
  ('ACA.POR', 'Porta empenada ou desalinhada',  'ACA', 'Folha fora de esquadro ou com folga irregular.', 'NBR 15930'),
  ('ACA.PIS', 'Piso solto, riscado ou manchado','ACA', 'Dano de acabamento no revestimento de piso.', 'NBR 15575-3'),
  -- Equipamentos
  ('EQP.FUN', 'Equipamento inoperante',         'EQP', 'Elevador, bomba, portão ou pressurizador que não funciona.', 'NBR 15575-1'),
  ('EQP.RUI', 'Ruído ou vibração excessiva',    'EQP', 'Operação fora do padrão acústico ou de vibração.', 'NBR 15575-1')
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      system_code = EXCLUDED.system_code,
      definition  = EXCLUDED.definition,
      norm_ref    = EXCLUDED.norm_ref,
      active      = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Colunas absorvidas por `warranty_claims`
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS taxonomy             JSONB,
  ADD COLUMN IF NOT EXISTS origin               TEXT,
  ADD COLUMN IF NOT EXISTS quality_score        JSONB,
  ADD COLUMN IF NOT EXISTS asset_floor_plan_ref JSONB,
  ADD COLUMN IF NOT EXISTS source_condition_id  UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warranty_claims_origin_check'
  ) THEN
    ALTER TABLE public.warranty_claims
      ADD CONSTRAINT warranty_claims_origin_check
      CHECK (origin IS NULL OR origin IN (
        'execucao', 'material', 'projeto', 'uso', 'manutencao', 'indeterminada'
      ));
  END IF;
END $$;

-- Idempotência do backfill: uma condição vira no máximo um chamado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_claims_source_condition
  ON public.warranty_claims(source_condition_id)
  WHERE source_condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_pathology
  ON public.warranty_claims((taxonomy->>'pathologyCode'))
  WHERE taxonomy IS NOT NULL;

COMMENT ON COLUMN public.warranty_claims.taxonomy IS
  '{ systemCode, pathologyCode?, normRef? } — taxonomia controlada em condition_taxonomy_*.';
COMMENT ON COLUMN public.warranty_claims.origin IS
  'Origem provável: execucao | material | projeto | uso | manutencao | indeterminada.';
COMMENT ON COLUMN public.warranty_claims.quality_score IS
  'Qualidade do REGISTRO (0-100), não do serviço. Calculado por trigger — nunca editar à mão.';
COMMENT ON COLUMN public.warranty_claims.asset_floor_plan_ref IS
  '{ planVersionId, xPct, yPct }. SEM INTERFACE hoje — coluna existe para não perder dado migrado.';
COMMENT ON COLUMN public.warranty_claims.source_condition_id IS
  'construction_conditions.id de origem, quando o chamado veio da consolidação de 2026-08-26.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. quality_score do chamado
--
--    Pesos (somam 100). Adaptado do cálculo de condições: `geoPresence` e
--    `signaturePresent` saíram porque `warranty_claim_evidence` não tem
--    `geo_ref`, e os 15 pontos foram redistribuídos em completude e taxonomia.
--
--      completeness         40  descrição ≥ 30 chars, local, unidade, prazo
--      evidenceDensity      30  nº de evidências vs mínimo pela severidade
--      taxonomicConsistency 30  patologia válida na taxonomia controlada
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_warranty_claim_quality_score(
  p_claim_id        UUID,
  p_organization_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim          public.warranty_claims%ROWTYPE;
  v_evidence_count INT;
  v_min_evidence   INT;
  v_completeness   FLOAT;
  v_density        FLOAT;
  v_taxonomic      FLOAT;
  v_score          INT;
BEGIN
  SELECT * INTO v_claim
  FROM public.warranty_claims
  WHERE id = p_claim_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_evidence_count
  FROM public.warranty_claim_evidence
  WHERE claim_id = p_claim_id
    AND organization_id = p_organization_id
    AND superseded = false;

  v_min_evidence := CASE v_claim.severity
    WHEN 'critica' THEN 3
    WHEN 'alta'    THEN 2
    ELSE 1
  END;

  -- 4 fatores de 0.25 cada
  v_completeness := (
    CASE WHEN length(coalesce(v_claim.descricao, '')) >= 30 THEN 0.25 ELSE 0.0 END +
    CASE WHEN coalesce(v_claim.local_afetado, '')      <> '' THEN 0.25 ELSE 0.0 END +
    CASE WHEN coalesce(v_claim.unidade_ref, '')        <> '' THEN 0.25 ELSE 0.0 END +
    CASE WHEN v_claim.warranty_term_code IS NOT NULL         THEN 0.25 ELSE 0.0 END
  );

  v_density := LEAST(v_evidence_count::FLOAT / v_min_evidence::FLOAT, 1.0);

  v_taxonomic := CASE
    WHEN v_claim.taxonomy IS NOT NULL
     AND v_claim.taxonomy->>'pathologyCode' IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.condition_taxonomy_pathologies
       WHERE code = v_claim.taxonomy->>'pathologyCode' AND active = true
     ) THEN 1.0
    -- sistema sem patologia vale metade: classificou, mas não até o fim
    WHEN v_claim.taxonomy IS NOT NULL
     AND v_claim.taxonomy->>'systemCode' IS NOT NULL THEN 0.5
    ELSE 0.0
  END;

  v_score := ROUND(v_completeness * 40 + v_density * 30 + v_taxonomic * 30);

  RETURN jsonb_build_object(
    'value',                v_score,
    'completeness',         ROUND(v_completeness::NUMERIC, 3),
    'evidenceDensity',      ROUND(v_density::NUMERIC, 3),
    'taxonomicConsistency', v_taxonomic,
    'evidenceCount',        v_evidence_count,
    'minEvidence',          v_min_evidence,
    'calculatedAt',         now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_warranty_claim_quality_score(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_warranty_claim_quality_score(UUID, UUID) TO authenticated;

-- Recalcula ao mexer no próprio chamado.
--
-- Precisa ser AFTER (não BEFORE): a contagem de evidências depende de linhas
-- que só existem depois do INSERT do chamado. AFTER não persiste NEW, então o
-- gatilho grava com UPDATE explícito.
--
-- Sem recursão: o UPDATE interno toca APENAS `quality_score`, e o gatilho é
-- `UPDATE OF` das colunas de conteúdo — coluna fora da lista não dispara.
CREATE OR REPLACE FUNCTION public.fn_warranty_claim_score_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_score JSONB;
BEGIN
  v_score := public.fn_warranty_claim_quality_score(NEW.id, NEW.organization_id);

  IF v_score IS DISTINCT FROM NEW.quality_score THEN
    UPDATE public.warranty_claims
       SET quality_score = v_score
     WHERE id = NEW.id AND organization_id = NEW.organization_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS set_warranty_claim_score ON public.warranty_claims;
CREATE TRIGGER set_warranty_claim_score
  AFTER INSERT OR UPDATE OF descricao, local_afetado, unidade_ref,
                            warranty_term_code, severity, taxonomy
  ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.fn_warranty_claim_score_after();

-- Anexar/remover evidência muda a densidade.
CREATE OR REPLACE FUNCTION public.fn_warranty_evidence_score_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_id UUID;
  v_org_id   UUID;
  v_score    JSONB;
BEGIN
  -- plpgsql não aceita COALESCE(NEW, OLD): são RECORD, não valor escalar.
  IF TG_OP = 'DELETE' THEN
    v_claim_id := OLD.claim_id;
    v_org_id   := OLD.organization_id;
  ELSE
    v_claim_id := NEW.claim_id;
    v_org_id   := NEW.organization_id;
  END IF;

  v_score := public.fn_warranty_claim_quality_score(v_claim_id, v_org_id);

  UPDATE public.warranty_claims
     SET quality_score = v_score
   WHERE id = v_claim_id
     AND organization_id = v_org_id
     AND quality_score IS DISTINCT FROM v_score;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS set_warranty_claim_score_on_evidence ON public.warranty_claim_evidence;
CREATE TRIGGER set_warranty_claim_score_on_evidence
  AFTER INSERT OR UPDATE OF superseded OR DELETE
  ON public.warranty_claim_evidence
  FOR EACH ROW EXECUTE FUNCTION public.fn_warranty_evidence_score_after();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. BACKFILL — condições existentes viram chamados
--
--    Roda igual esteja a tabela vazia (migra 0) ou cheia (migra todas).
--    Idempotente: `source_condition_id` é UNIQUE e o NOT EXISTS corta a
--    segunda rodada.
--
--    A evidência NÃO é copiada de propósito: `condition_evidence.url` guarda
--    PATH do bucket `condition-evidence` e `warranty_claim_evidence.url` guarda
--    URL. Copiar quebraria a renderização. O front lê a evidência de origem
--    pelo `source_condition_id` e assina a URL na hora.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.warranty_claims (
  organization_id, project_id, unidade_ref, local_afetado,
  sistema_descricao, descricao, severity, state, origin,
  taxonomy, asset_floor_plan_ref, quality_score, warranty_term_code,
  opened_by, source_condition_id, version, created_at, updated_at
)
SELECT
  c.organization_id,
  -- asset_empreendimento_id recebia o id da OBRA (ver DetectConditionModal).
  -- A subconsulta evita violar a FK se apontar para algo fora de `projects`.
  (SELECT p.id FROM public.projects p WHERE p.id = c.asset_empreendimento_id),
  NULLIF(c.asset_unidade_id, ''),
  NULLIF(c.asset_ambiente_id, ''),
  COALESCE(s.name, 'Condição migrada do módulo Qualidade'),
  COALESCE(
    NULLIF(c.description, ''),
    'Registro migrado do módulo Qualidade & Entrega em 2026-08-26 (condição ' || c.id || ').'
  ),
  c.severity,
  CASE c.state
    WHEN 'DETECTED'        THEN 'ABERTO'
    WHEN 'CLASSIFIED'      THEN 'TRIAGEM'
    WHEN 'ACTION_REQUIRED' THEN 'EM_GARANTIA'
    WHEN 'IN_REPAIR'       THEN 'EM_REPARO'
    WHEN 'REPAIRED'        THEN 'CONCLUIDO'
    WHEN 'VALIDATED'       THEN 'ENCERRADO'
    WHEN 'CLOSED'          THEN 'ENCERRADO'
    WHEN 'CONTESTED'       THEN 'CONTESTADO'
    WHEN 'ESCALATED'       THEN 'CONTESTADO'
    WHEN 'REOPENED'        THEN 'REABERTO'
    ELSE 'ABERTO'
  END,
  c.origin,
  COALESCE(c.taxonomy, c.provisional_taxonomy),
  c.asset_floor_plan_ref,
  c.quality_score,
  s.warranty_term_code,
  c.detected_by,
  c.id,
  1,
  c.created_at,
  c.updated_at
FROM public.construction_conditions c
LEFT JOIN public.condition_taxonomy_systems s
  ON s.code = COALESCE(c.taxonomy, c.provisional_taxonomy)->>'systemCode'
WHERE NOT EXISTS (
  SELECT 1 FROM public.warranty_claims w WHERE w.source_condition_id = c.id
);

-- Evento de auditoria para cada chamado nascido da migração.
INSERT INTO public.warranty_claim_events (
  organization_id, claim_id, event_type, payload, aggregate_version
)
SELECT
  w.organization_id, w.id, 'ClaimMigratedFromCondition',
  jsonb_build_object(
    'sourceConditionId', w.source_condition_id,
    'migration',         'aplicar_20270914000007',
    'state',             w.state
  ),
  1
FROM public.warranty_claims w
WHERE w.source_condition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.warranty_claim_events e
    WHERE e.claim_id = w.id AND e.event_type = 'ClaimMigratedFromCondition'
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Recalcula o score de todos os chamados (inclusive os que já existiam)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.warranty_claims w
   SET quality_score = public.fn_warranty_claim_quality_score(w.id, w.organization_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. As tabelas de Qualidade passam a ser legado
--    Ficam no banco, legíveis. Não recebem escrita nova pelo app.
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.construction_conditions IS
  'LEGADO (2026-08-26). Módulo "Qualidade & Entrega" consolidado em "Pós-Obra & Garantia". Dados migrados para warranty_claims.source_condition_id. Sem escrita nova pelo app. Ver docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md';
COMMENT ON TABLE public.condition_evidence IS
  'LEGADO (2026-08-26). Ainda LIDA: o detalhe do chamado migrado mostra estas evidências. Ver warranty_claims.source_condition_id.';
COMMENT ON TABLE public.condition_action_plans   IS 'LEGADO (2026-08-26) — ver construction_conditions.';
COMMENT ON TABLE public.condition_responsibilities IS 'LEGADO (2026-08-26) — ver construction_conditions.';
COMMENT ON TABLE public.condition_validations    IS 'LEGADO (2026-08-26) — ver construction_conditions.';
COMMENT ON TABLE public.condition_contestations  IS 'LEGADO (2026-08-26) — ver construction_conditions.';
COMMENT ON TABLE public.condition_events         IS 'LEGADO (2026-08-26) — ver construction_conditions.';

-- Taxonomia NÃO é legado: passou a ser a taxonomia do módulo de Garantia.
COMMENT ON TABLE public.condition_taxonomy_systems IS
  'ATIVA. Taxonomia controlada de sistemas construtivos, usada por warranty_claims.taxonomy. Semeada em aplicar_20270914000007.';
COMMENT ON TABLE public.condition_taxonomy_pathologies IS
  'ATIVA. Taxonomia controlada de patologias, usada por warranty_claims.taxonomy. Semeada em aplicar_20270914000007.';

COMMIT;
