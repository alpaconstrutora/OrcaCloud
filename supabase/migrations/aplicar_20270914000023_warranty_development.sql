-- ============================================================================
-- Pós-Obra & Garantia: vínculo com Empreendimento
-- OrçaCloud SaaS · aplicar_20270914000023
-- Plano: docs/planos/2026-08-30-pos-obra-garantia-vinculos-abas-ui.md
--
-- `warranty_claims` já amarra obra (`project_id`) e cliente (`client_id`) desde
-- 20260708000000, mas não tinha nenhuma coluna de empreendimento — então não
-- havia como responder "quantos chamados por empreendimento?". Esta migration
-- acrescenta `development_id` e o repassa pela RPC de abertura.
--
-- O vínculo é PRÓPRIO, não derivado da obra: um chamado pode nascer de uma
-- unidade entregue de um empreendimento cuja obra já foi encerrada (ou que
-- nunca teve obra cadastrada). Derivar de `empreendimentos.project_id` daria
-- NULL justamente nesses casos, que são a maioria em pós-obra.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — coluna e índice
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS development_id UUID
    REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.warranty_claims.development_id IS
  'Empreendimento (incorporação) a que o chamado pertence. Independente de '
  'project_id: chamado de pós-obra costuma existir depois de a obra encerrar.';

-- Parcial como os dois índices irmãos de 20260708000000:110-115 — a maioria dos
-- chamados antigos fica com NULL e não precisa entrar no índice.
CREATE INDEX IF NOT EXISTS idx_warranty_claims_development
  ON public.warranty_claims(development_id)
  WHERE development_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — open_warranty_claim passa a aceitar o empreendimento
--
-- A assinatura de 13 parâmetros é DROPADA antes, não substituída: um
-- `CREATE OR REPLACE` com um parâmetro a mais criaria SOBRECARGA, e duas
-- funções de mesmo nome deixam o PostgREST ambíguo (PGRST203). Mesma lição de
-- aplicar_20270914000008.
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT
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
  p_development_id     UUID  DEFAULT NULL
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
    organization_id, project_id, development_id, client_id, client_name, unidade_ref,
    sistema_descricao, local_afetado, descricao, severity,
    warranty_term_code, state, opened_by, version, taxonomy, origin
  ) VALUES (
    p_organization_id, p_project_id, p_development_id, p_client_id, p_client_name, p_unidade_ref,
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
      'developmentId', p_development_id
    ), 1
  );

  RETURN jsonb_build_object('id', v_id, 'version', 1);
END;
$$;

-- RPC recriada = permissão recriada do zero (padrão do repo).
REVOKE ALL ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_warranty_claim(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, UUID
) TO authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada — consulta dentro do mesmo
-- lote transacional não prova nada):
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'warranty_claims' AND column_name = 'development_id';
--
--   SELECT proname, pronargs FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND proname = 'open_warranty_claim';
--
-- A segunda tem de devolver UMA linha, com pronargs = 14. Duas linhas =
-- sobrecarga = PGRST203 no app; o DROP não rodou.
-- ────────────────────────────────────────────────────────────────────────────
