-- ============================================================================
-- Pós-Obra & Garantia: exclusão de chamado deixa de ser teatro
-- OrçaCloud SaaS · aplicar_20270914000009
-- Plano: docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md
--
-- O PROBLEMA
--   `warranty_claims` tem policy de SELECT, INSERT e UPDATE para `authenticated`
--   e NENHUMA de DELETE (a única FOR ALL era a de `anon` para dev, dropada em
--   20270208000002). Com RLS ligada e sem policy permissiva, o DELETE apaga
--   ZERO linhas e NÃO devolve erro. `warrantyService.delete()` só trata `error`,
--   então o detalhe mostra "Chamado excluído" e o chamado continua na lista.
--   Confirmado na prática em 2026-08-26: HTTP 200, corpo [], linha intacta.
--
-- POR QUE RESTAURAR A EXCLUSÃO EM VEZ DE ARQUIVAR
--   Três sinais dizem que a falta da policy foi ESQUECIMENTO, não decisão:
--   as outras três policies existem; a UI tem botão de excluir; e o texto da
--   confirmação diz, literalmente, "Todo o histórico e evidências serão
--   removidos". Esta migration restaura o que estava claramente pretendido.
--   Se a decisão de produto for outra (arquivar, ou não deixar apagar), o
--   caminho é remover estas policies — não deixá-las meio funcionando.
--
-- O QUE ELA FAZ
--   1. Policies de DELETE nas 3 tabelas do agregado + no bucket de evidência.
--   2. RPC `delete_warranty_claim`, que apaga na ordem certa e DEVOLVE quanto
--      apagou — para o app poder distinguir "apaguei" de "não tinha permissão".
--
-- APLICAÇÃO: SQL direto no editor. NUNCA `supabase db push`.
--   ⚠️ Não deixe trecho selecionado no editor — ele roda só a seleção.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Policies de DELETE — mesmo recorte de organização das outras três
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "warranty_claims_delete" ON public.warranty_claims;
CREATE POLICY "warranty_claims_delete"
  ON public.warranty_claims FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_evidence_delete" ON public.warranty_claim_evidence;
CREATE POLICY "warranty_evidence_delete"
  ON public.warranty_claim_evidence FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

DROP POLICY IF EXISTS "warranty_events_delete" ON public.warranty_claim_events;
CREATE POLICY "warranty_events_delete"
  ON public.warranty_claim_events FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE email = auth.jwt()->>'email'
  ));

-- Sem esta, o arquivo fica órfão no bucket depois de apagar o chamado.
-- Mesmo recorte de pasta usado no upload: {organizationId}/warranty/...
DROP POLICY IF EXISTS "warranty_evidence_delete_object" ON storage.objects;
CREATE POLICY "warranty_evidence_delete_object"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'warranty-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.organization_members
      WHERE email = auth.jwt()->>'email'
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC de exclusão
--
--    Existe por dois motivos, além da conveniência:
--
--    a) ORDEM. `warranty_claim_evidence.claim_id` é ON DELETE RESTRICT — apagar
--       o chamado antes da evidência falha. Visitas são CASCADE; eventos não
--       têm FK e ficariam órfãos. Uma transação resolve os três.
--
--    b) CONTAGEM. O `.delete()` do PostgREST devolve 200 com corpo vazio tanto
--       quando apagou quanto quando a RLS barrou. A RPC devolve quanto apagou,
--       e é isso que deixa o app falhar alto em vez de mentir.
--
--    SECURITY INVOKER de propósito: a RLS continua valendo: quem não é membro
--    da organização não apaga nada. A função não é um bypass.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_warranty_claim(
  p_claim_id        UUID,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_paths     TEXT[];
  v_evidence  INT := 0;
  v_visits    INT := 0;
  v_events    INT := 0;
  v_claims    INT := 0;
BEGIN
  -- Caminhos no storage ANTES de apagar as linhas — depois não dá para saber
  -- quais arquivos ficaram para trás.
  SELECT COALESCE(array_agg(url), '{}')
    INTO v_paths
    FROM public.warranty_claim_evidence
   WHERE claim_id = p_claim_id AND organization_id = p_organization_id;

  DELETE FROM public.warranty_claim_evidence
   WHERE claim_id = p_claim_id AND organization_id = p_organization_id;
  GET DIAGNOSTICS v_evidence = ROW_COUNT;

  DELETE FROM public.warranty_claim_visits
   WHERE claim_id = p_claim_id AND organization_id = p_organization_id;
  GET DIAGNOSTICS v_visits = ROW_COUNT;

  DELETE FROM public.warranty_claim_events
   WHERE claim_id = p_claim_id AND organization_id = p_organization_id;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.warranty_claims
   WHERE id = p_claim_id AND organization_id = p_organization_id;
  GET DIAGNOSTICS v_claims = ROW_COUNT;

  -- Zero linhas aqui significa uma de duas coisas, e nenhuma delas é sucesso:
  -- o chamado não existe, ou a RLS barrou. Estourar é o ponto da função.
  IF v_claims = 0 THEN
    RAISE EXCEPTION 'NotFound: chamado % não foi excluído (inexistente ou fora da sua organização)', p_claim_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'claims',   v_claims,
    'evidence', v_evidence,
    'visits',   v_visits,
    'events',   v_events,
    'storagePaths', to_jsonb(v_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_warranty_claim(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_warranty_claim(UUID, UUID) TO authenticated;

COMMIT;

-- ############################################################################
-- CONFERÊNCIA — esperado 4 linhas de policy + a função
-- ############################################################################

SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE (schemaname = 'public'  AND tablename LIKE 'warranty_%' AND cmd = 'DELETE')
    OR (schemaname = 'storage' AND policyname = 'warranty_evidence_delete_object')
 ORDER BY tablename, policyname;
