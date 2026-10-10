-- ============================================================================
-- Pós-Obra & Garantia: vínculo com a UNIDADE + diretório para autopreencher
-- OrçaCloud SaaS · aplicar_20271010000200
-- Plano: docs/planos/2026-10-10-pos-obra-garantia-autopreencher-cliente-unidade.md
--
-- Pedido (2026-10-10): "carregar todos os dados ao selecionar uma cliente e ou
-- unidades. Regra geral: se o app já tem as informações não vamos obrigar o
-- usuário preencher manualmente".
--
-- Até aqui a unidade do chamado era só texto livre (`unidade_ref`), e
-- empreendimento, obra e cliente eram escolhidos um a um — embora o app já
-- saiba tudo isso a partir da unidade cadastrada (Empreendimento › Torre ›
-- Unidade), das ocupações do condomínio e das negociações efetivadas.
--
--   PARTE 1 — `warranty_claims.unit_id` (o texto fica como instantâneo)
--   PARTE 2 — `open_warranty_claim` aceita `p_unit_id`
--   PARTE 3 — `warranty_unit_directory(org)`: uma linha por unidade, com
--             empreendimento, obra, clientes atuais e a data de entrega
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — coluna e índice (espelha `development_id`, aplicar_20270914000023)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS unit_id UUID
    REFERENCES public.empreendimento_units(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.warranty_claims.unit_id IS
  'Unidade cadastrada (empreendimento_units) do chamado. `unidade_ref` continua '
  'gravado como instantâneo do rótulo — é o que a lista lê, e o que preserva a '
  'leitura de um chamado cuja unidade foi renomeada ou removida.';

CREATE INDEX IF NOT EXISTS idx_warranty_claims_unit
  ON public.warranty_claims(unit_id)
  WHERE unit_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — open_warranty_claim passa a aceitar a unidade
--
-- Corpo reescrito a partir da definição VIGENTE no banco (pg_get_functiondef,
-- 2026-10-10), não do arquivo antigo. A assinatura de 14 parâmetros é DROPADA
-- antes: `CREATE OR REPLACE` com um parâmetro a mais criaria sobrecarga e o
-- PostgREST ficaria ambíguo (PGRST203).
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.open_warranty_claim(
  p_organization_id    UUID,
  p_project_id         UUID,
  p_client_id          UUID,
  p_client_name        TEXT,
  p_unidade_ref        TEXT,
  p_sistema_descricao  TEXT,
  p_local_afetado      TEXT,
  p_descricao          TEXT,
  p_severity           TEXT,
  p_warranty_term_code TEXT,
  p_opened_by          JSONB,
  p_taxonomy           JSONB DEFAULT NULL,
  p_origin             TEXT  DEFAULT NULL,
  p_development_id     UUID  DEFAULT NULL,
  p_unit_id            UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_severity NOT IN ('baixa', 'media', 'alta', 'critica') THEN
    RAISE EXCEPTION 'InvariantViolation: severidade inválida %', p_severity
      USING ERRCODE = 'P0004';
  END IF;

  IF p_origin IS NOT NULL AND p_origin NOT IN (
    'execucao', 'material', 'projeto', 'uso', 'manutencao', 'indeterminada'
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: origem inválida %', p_origin
      USING ERRCODE = 'P0004';
  END IF;

  -- O empreendimento tem de ser da MESMA organização do chamado. Sem esta
  -- checagem, a FK sozinha aceitaria o id de um empreendimento de outro
  -- tenant — a RLS de `empreendimentos` protege a leitura, não o valor que
  -- chega por parâmetro.
  IF p_development_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.empreendimentos
    WHERE id = p_development_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: empreendimento % não pertence à organização %',
      p_development_id, p_organization_id
      USING ERRCODE = 'P0004';
  END IF;

  -- Mesma trava para a unidade: `empreendimento_units` não tem
  -- organization_id próprio, a organização é a do empreendimento da torre.
  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.empreendimento_units u
    JOIN public.empreendimento_towers t ON t.id = u.tower_id
    JOIN public.empreendimentos e       ON e.id = t.empreendimento_id
    WHERE u.id = p_unit_id AND e.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: unidade % não pertence à organização %',
      p_unit_id, p_organization_id
      USING ERRCODE = 'P0004';
  END IF;

  -- Taxonomia é OPCIONAL (um chamado pode nascer de um telefonema, sem
  -- classificação). Mas se vier, tem de bater com a taxonomia controlada —
  -- é isso que impede o vocabulário de virar texto livre de novo.
  IF p_taxonomy IS NOT NULL AND p_taxonomy->>'pathologyCode' IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.condition_taxonomy_pathologies p
      JOIN public.condition_taxonomy_systems s ON s.code = p.system_code
      WHERE p.code = p_taxonomy->>'pathologyCode'
        AND p.active = true
        AND (p_taxonomy->>'systemCode' IS NULL OR s.code = p_taxonomy->>'systemCode')
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: patologia % não pertence à taxonomia controlada (sistema %)',
        p_taxonomy->>'pathologyCode', p_taxonomy->>'systemCode'
        USING ERRCODE = 'P0004';
    END IF;
  ELSIF p_taxonomy IS NOT NULL AND p_taxonomy->>'systemCode' IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.condition_taxonomy_systems
      WHERE code = p_taxonomy->>'systemCode' AND active = true
    ) THEN
      RAISE EXCEPTION 'InvariantViolation: sistema % não pertence à taxonomia controlada',
        p_taxonomy->>'systemCode'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  INSERT INTO public.warranty_claims (
    organization_id, project_id, development_id, unit_id, client_id, client_name, unidade_ref,
    sistema_descricao, local_afetado, descricao, severity,
    warranty_term_code, state, opened_by, version, taxonomy, origin
  ) VALUES (
    p_organization_id, p_project_id, p_development_id, p_unit_id, p_client_id, p_client_name, p_unidade_ref,
    p_sistema_descricao, p_local_afetado, p_descricao, p_severity,
    p_warranty_term_code, 'ABERTO', p_opened_by, 1, p_taxonomy, p_origin
  ) RETURNING id INTO v_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, v_id, 'ClaimOpened',
    jsonb_build_object(
      'state', 'ABERTO', 'severity', p_severity,
      'sistema', p_sistema_descricao, 'actor', p_opened_by,
      'taxonomy', p_taxonomy, 'origin', p_origin,
      'developmentId', p_development_id, 'unitId', p_unit_id
    ), 1
  );

  RETURN jsonb_build_object('id', v_id, 'version', 1);
END;
$$;

-- RPC recriada = permissão recriada do zero (REGRA #7: REVOKE de PUBLIC E anon).
REVOKE ALL ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID
) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — diretório de unidades da organização
--
-- Uma linha por unidade, com tudo que o formulário do chamado precisa para se
-- preencher sozinho. SECURITY INVOKER: a RLS de cada tabela recorta, então a
-- função não amplia o que o usuário já lê. LANGUAGE sql (não plpgsql) porque
-- RETURNS TABLE em plpgsql transforma cada coluna de saída em variável e dá
-- "column reference is ambiguous" — já mordeu três vezes neste repo.
--
-- Clientes da unidade, de duas fontes:
--   * `unit_occupancies` atuais (ended_at NULL ou no futuro);
--   * negociações EFETIVADAS (CONTRATO/ASSINATURA/COMPLETED — mesma régua de
--     services/occupancyImportService.ts:43; reserva não conta). Venda →
--     PROPRIETARIO pela `commercial_property_id`; locação vigente → INQUILINO
--     pela `rental_property_id`. Todos os compradores (`commercial_deal_buyers`),
--     não só o principal.
-- Um cliente aparece uma vez por unidade, com o papel mais forte.
--
-- Data de entrega (não existe campo por unidade), nesta ordem:
--   1. posse do 1º proprietário  — min(started_at) de PROPRIETARIO em unit_occupancies
--   2. habite-se                  — company_incorporacao.habite_se_data
--   3. condomínio instalado       — empreendimentos.condominio_instalado_em
--   4. previsão de entrega        — empreendimentos.expected_delivery_date
-- A fonte vai junto para a tela dizer de onde a data veio.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.warranty_unit_directory(p_organization_id UUID)
RETURNS TABLE (
  unit_id             UUID,
  unit_name           TEXT,
  unit_floor          INTEGER,
  quadra              TEXT,
  lote                TEXT,
  tower_name          TEXT,
  empreendimento_id   UUID,
  empreendimento_name TEXT,
  project_id          UUID,
  clients             JSONB,
  entrega_data        DATE,
  entrega_fonte       TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH unidades AS (
    SELECT u.id AS unit_id, u.name AS unit_name, u.floor AS unit_floor,
           u.quadra, u.lote, t.name AS tower_name,
           e.id AS empreendimento_id, e.name AS empreendimento_name,
           COALESCE(t.project_id, e.project_id) AS project_id,
           u.commercial_property_id, u.rental_property_id,
           e.condominio_instalado_em, e.expected_delivery_date,
           t.sort_order AS tower_sort, u.sort_order AS unit_sort
    FROM public.empreendimento_units u
    JOIN public.empreendimento_towers t ON t.id = u.tower_id
    JOIN public.empreendimentos e       ON e.id = t.empreendimento_id
    WHERE e.organization_id = p_organization_id
  ),
  imoveis_do_negocio AS (
    SELECT d.id AS deal_id, d.type, d.date, du.property_id
    FROM public.commercial_deals d
    JOIN public.commercial_deal_units du ON du.deal_id = d.id
    WHERE d.organization_id = p_organization_id
      AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
    UNION
    SELECT d.id, d.type, d.date, d.property_id
    FROM public.commercial_deals d
    WHERE d.organization_id = p_organization_id
      AND d.property_id IS NOT NULL
      AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
      AND (d.type = 'SALE' OR d.end_date IS NULL OR d.end_date >= current_date)
  ),
  clientes_do_negocio AS (
    SELECT b.deal_id, b.client_id FROM public.commercial_deal_buyers b
    UNION
    SELECT d.id, d.client_id FROM public.commercial_deals d
    WHERE d.organization_id = p_organization_id AND d.client_id IS NOT NULL
  ),
  vinculos AS (
    SELECT o.unit_id, o.client_id, o.role AS papel, o.started_at AS desde, 'ocupacao' AS fonte
    FROM public.unit_occupancies o
    JOIN unidades un ON un.unit_id = o.unit_id
    WHERE o.client_id IS NOT NULL
      AND (o.ended_at IS NULL OR o.ended_at >= current_date)
    UNION ALL
    SELECT un.unit_id, cn.client_id,
           CASE WHEN n.type = 'SALE' THEN 'PROPRIETARIO' ELSE 'INQUILINO' END,
           n.date, 'negociacao'
    FROM imoveis_do_negocio n
    JOIN unidades un
      ON (n.type = 'SALE'                AND un.commercial_property_id = n.property_id)
      OR (n.type IN ('RENT', 'RENTAL')   AND un.rental_property_id     = n.property_id)
    JOIN clientes_do_negocio cn ON cn.deal_id = n.deal_id
  ),
  um_por_cliente AS (
    SELECT DISTINCT ON (v.unit_id, v.client_id)
           v.unit_id, v.client_id, v.papel, v.desde, v.fonte,
           CASE v.papel WHEN 'PROPRIETARIO' THEN 1 WHEN 'INQUILINO' THEN 2
                        WHEN 'MORADOR' THEN 3 ELSE 4 END AS forca
    FROM vinculos v
    ORDER BY v.unit_id, v.client_id,
             CASE v.papel WHEN 'PROPRIETARIO' THEN 1 WHEN 'INQUILINO' THEN 2
                          WHEN 'MORADOR' THEN 3 ELSE 4 END,
             (v.fonte = 'ocupacao') DESC
  )
  SELECT un.unit_id, un.unit_name, un.unit_floor, un.quadra, un.lote, un.tower_name,
         un.empreendimento_id, un.empreendimento_name, un.project_id,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'client_id',   pc.client_id,
                    'client_name', c.name,
                    'role',        pc.papel,
                    'since',       pc.desde,
                    'fonte',       pc.fonte)
                  ORDER BY pc.forca, c.name)
           FROM um_por_cliente pc
           LEFT JOIN public.clients c ON c.id = pc.client_id
           WHERE pc.unit_id = un.unit_id
         ), '[]'::jsonb) AS clients,
         COALESCE(ent.posse, ent.habite_se, un.condominio_instalado_em, un.expected_delivery_date) AS entrega_data,
         CASE
           WHEN ent.posse     IS NOT NULL THEN 'posse_proprietario'
           WHEN ent.habite_se IS NOT NULL THEN 'habite_se'
           WHEN un.condominio_instalado_em IS NOT NULL THEN 'condominio_instalado'
           WHEN un.expected_delivery_date  IS NOT NULL THEN 'previsao_entrega'
         END AS entrega_fonte
  FROM unidades un
  CROSS JOIN LATERAL (
    SELECT
      (SELECT min(o.started_at) FROM public.unit_occupancies o
        WHERE o.unit_id = un.unit_id AND o.role = 'PROPRIETARIO') AS posse,
      (SELECT max(ci.habite_se_data) FROM public.company_incorporacao ci
        WHERE ci.empreendimento_id = un.empreendimento_id) AS habite_se
  ) ent
  ORDER BY un.empreendimento_name, un.tower_sort NULLS LAST, un.tower_name,
           un.unit_sort NULLS LAST, un.unit_name;
$$;

REVOKE ALL ON FUNCTION public.warranty_unit_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warranty_unit_directory(UUID) TO authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada):
--
--   SELECT p.oid::regprocedure, p.proacl FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN ('open_warranty_claim', 'warranty_unit_directory');
--
-- `open_warranty_claim` tem de aparecer UMA vez, com 15 argumentos. Nenhuma das
-- duas pode ter `=X/` (PUBLIC) nem `anon=X` na ACL.
-- ────────────────────────────────────────────────────────────────────────────
