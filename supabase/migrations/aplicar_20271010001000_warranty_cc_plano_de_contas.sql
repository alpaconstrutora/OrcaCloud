-- ============================================================================
-- Pós-Obra & Garantia: Centro de Custo e Plano de Contas no chamado
-- OrçaCloud SaaS · aplicar_20271010001000
-- Plano: docs/planos/2026-10-10-pos-obra-garantia-autopreencher-cliente-unidade.md (Item 10)
--
-- Pedido (2026-10-10): "falta centro de custo e plano de contas" no drawer
-- Abrir chamado de garantia.
--
-- São duas dimensões DIFERENTES (ver financialRegistryService.ts):
--   * centro de custo  → cost_centers_v2  (mesma coluna dos demais lançamentos)
--   * plano de contas  → plano_de_contas  (NÃO é financial_categories, que é a
--                                          categoria do DRE)
-- O chamado não gera lançamento financeiro; os dois campos classificam o custo
-- de assistência técnica (custo_estimado / custo_real) para relatório.
--
-- Molde: 20270846000000_commercial_deals_cost_center_plano_contas.sql.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — colunas, FKs e índices
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS cost_center_id     UUID,
  ADD COLUMN IF NOT EXISTS plano_de_contas_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_claims_cost_center_id_fkey') THEN
    ALTER TABLE public.warranty_claims
      ADD CONSTRAINT warranty_claims_cost_center_id_fkey
      FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_claims_plano_de_contas_id_fkey') THEN
    ALTER TABLE public.warranty_claims
      ADD CONSTRAINT warranty_claims_plano_de_contas_id_fkey
      FOREIGN KEY (plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_cost_center
  ON public.warranty_claims(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_plano_de_contas
  ON public.warranty_claims(plano_de_contas_id) WHERE plano_de_contas_id IS NOT NULL;

COMMENT ON COLUMN public.warranty_claims.cost_center_id IS
  'Centro de custo (cost_centers_v2) do chamado. A tela sugere o CC da obra '
  '(ou do empreendimento) quando há um só.';
COMMENT ON COLUMN public.warranty_claims.plano_de_contas_id IS
  'Plano de contas (plano_de_contas) do chamado. NÃO confundir com '
  'financial_categories (categoria do DRE).';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — open_warranty_claim aceita os dois
--
-- Corpo reescrito a partir da definição VIGENTE (15 args, a de
-- aplicar_20271010000200 — conferida no banco em 2026-10-10). A assinatura de
-- 15 é DROPADA antes: com parâmetros a mais, CREATE OR REPLACE criaria
-- sobrecarga e o PostgREST ficaria ambíguo (PGRST203).
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID
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
  p_unit_id            UUID  DEFAULT NULL,
  p_cost_center_id     UUID  DEFAULT NULL,
  p_plano_de_contas_id UUID  DEFAULT NULL
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

  -- Centro de custo e plano de contas: mesma trava de organização. A FK só
  -- garante que o id existe — não que é desta organização.
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers_v2
    WHERE id = p_cost_center_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: centro de custo % não pertence à organização %',
      p_cost_center_id, p_organization_id
      USING ERRCODE = 'P0004';
  END IF;

  IF p_plano_de_contas_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.plano_de_contas
    WHERE id = p_plano_de_contas_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'InvariantViolation: plano de contas % não pertence à organização %',
      p_plano_de_contas_id, p_organization_id
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
    warranty_term_code, state, opened_by, version, taxonomy, origin,
    cost_center_id, plano_de_contas_id
  ) VALUES (
    p_organization_id, p_project_id, p_development_id, p_unit_id, p_client_id, p_client_name, p_unidade_ref,
    p_sistema_descricao, p_local_afetado, p_descricao, p_severity,
    p_warranty_term_code, 'ABERTO', p_opened_by, 1, p_taxonomy, p_origin,
    p_cost_center_id, p_plano_de_contas_id
  ) RETURNING id INTO v_id;

  INSERT INTO public.warranty_claim_events (
    organization_id, claim_id, event_type, payload, aggregate_version
  ) VALUES (
    p_organization_id, v_id, 'ClaimOpened',
    jsonb_build_object(
      'state', 'ABERTO', 'severity', p_severity,
      'sistema', p_sistema_descricao, 'actor', p_opened_by,
      'taxonomy', p_taxonomy, 'origin', p_origin,
      'developmentId', p_development_id, 'unitId', p_unit_id,
      'costCenterId', p_cost_center_id, 'planoDeContasId', p_plano_de_contas_id
    ), 1
  );

  RETURN jsonb_build_object('id', v_id, 'version', 1);
END;
$$;

-- RPC recriada = permissão recriada do zero (REGRA #7: REVOKE de PUBLIC E anon).
REVOKE ALL ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, UUID, UUID, UUID
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada):
--
--   SELECT p.oid::regprocedure, p.proacl FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND proname = 'open_warranty_claim';
--
-- UMA linha, 17 argumentos, sem `=X/` (PUBLIC) nem `anon=X` na ACL.
-- ────────────────────────────────────────────────────────────────────────────
