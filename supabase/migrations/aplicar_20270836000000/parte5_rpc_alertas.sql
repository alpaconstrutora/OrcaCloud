-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 5 de 5: RPC de alertas da carteira
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar SOZINHA, depois da parte 4 (a RPC referencia as tabelas novas).
--
-- CREATE FUNCTION não pega lock em tabela nenhuma — esta parte não deadlocka.
--
-- ⚠️ plpgsql + RETURNS TABLE: as colunas de saída viram variáveis OUT e colidem
-- com colunas homônimas (erro 42702). Por isso todo SELECT usa alias explícito.
-- ⚠️ REVOKE de PUBLIC é obrigatório: `GRANT ... TO authenticated` sozinho NÃO
-- retira o EXECUTE que PUBLIC ganha por padrão (anon continuaria chamando).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_rental_guarantee_alerts(
    p_organization_id UUID
)
RETURNS TABLE (
    contract_id     UUID,
    contract_number TEXT,
    contract_title  TEXT,
    guarantee_id    UUID,
    alert_code      TEXT,
    severity        TEXT,
    detail          TEXT,
    reference_date  DATE
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT om.organization_id FROM public.organization_members om
    WHERE (om.user_id IS NOT NULL AND om.user_id = auth.uid())
       OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt()->>'email'))
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  -- REGRA #5: org nula ("Todas as organizações") não bloqueia a leitura —
  -- varre todas as organizações do usuário.
  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  -- (a) Locação vigente SEM garantia ativa. Inclui o contrato-filho de
  --     renovação, que nasce descoberto até a reanálise ser feita.
  SELECT c.id, c.number, c.title, NULL::UUID,
         'SEM_GARANTIA_ATIVA'::TEXT, 'ALTA'::TEXT,
         'Contrato de locação vigente sem garantia ativa.'::TEXT,
         c.start_date
  FROM public.contracts c
  WHERE c.organization_id = ANY(v_targets)
    AND c.domain = 'LOCACAO'
    AND c.status IN ('Ativo', 'Assinado')
    AND NOT EXISTS (
      SELECT 1 FROM public.contract_guarantees g
      WHERE g.contract_id = c.id AND g.scope = 'LOCACAO' AND g.is_active
    )

  UNION ALL
  -- (b) Garantia vencendo (90/60/30 dias) ou já vencida.
  SELECT c.id, c.number, c.title, g.id,
         'VIGENCIA'::TEXT,
         CASE WHEN g.valid_until < CURRENT_DATE THEN 'ALTA'
              WHEN g.valid_until <= CURRENT_DATE + 30 THEN 'ALTA'
              WHEN g.valid_until <= CURRENT_DATE + 60 THEN 'MEDIA'
              ELSE 'BAIXA' END,
         CASE WHEN g.valid_until < CURRENT_DATE
              THEN 'Garantia vencida em ' || to_char(g.valid_until, 'DD/MM/YYYY') || '.'
              ELSE 'Garantia vence em ' || (g.valid_until - CURRENT_DATE) || ' dia(s).' END,
         g.valid_until
  FROM public.contract_guarantees g
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE g.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO' AND g.is_active
    AND g.valid_until IS NOT NULL
    AND g.valid_until <= CURRENT_DATE + 90

  UNION ALL
  -- (c) Vigência da garantia não cobre a vigência do contrato.
  SELECT c.id, c.number, c.title, g.id,
         'COBERTURA_MENOR_QUE_CONTRATO'::TEXT, 'ALTA'::TEXT,
         'A garantia termina antes do fim da vigência do contrato.'::TEXT,
         g.valid_until
  FROM public.contract_guarantees g
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE g.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO' AND g.is_active
    AND g.valid_until IS NOT NULL AND c.end_date IS NOT NULL
    AND g.valid_until < c.end_date

  UNION ALL
  -- (d) Fiança sem outorga conjugal registrada (CC 1.647). Alerta, não bloqueio:
  --     o regime de separação absoluta dispensa.
  SELECT c.id, c.number, c.title, g.id,
         'OUTORGA_CONJUGAL_AUSENTE'::TEXT, 'MEDIA'::TEXT,
         'Fiador ' || gr.name || ' sem consentimento do cônjuge registrado.',
         NULL::DATE
  FROM public.contract_guarantors gr
  JOIN public.contract_guarantees g ON g.id = gr.guarantee_id
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE gr.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO' AND g.is_active AND g.kind = 'FIANCA'
    AND gr.person_type = 'PF'
    AND NOT gr.spouse_consent
    AND COALESCE(gr.marital_status, '') NOT IN ('Solteiro(a)', 'Solteiro', 'SOLTEIRO')

  UNION ALL
  -- (e) Documento obrigatório faltando ou vencido.
  SELECT c.id, c.number, c.title, g.id,
         'DOCUMENTO_PENDENTE'::TEXT, 'MEDIA'::TEXT,
         'Documento obrigatório pendente: ' || d.label,
         d.valid_until
  FROM public.guarantee_documents d
  JOIN public.contract_guarantees g ON g.id = d.guarantee_id
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE d.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO' AND g.is_active
    AND d.is_required
    AND (NOT d.received OR (d.valid_until IS NOT NULL AND d.valid_until < CURRENT_DATE))

  UNION ALL
  -- (f) Contrato encerrado com caução ainda a devolver.
  SELECT c.id, c.number, c.title, g.id,
         'CAUCAO_A_DEVOLVER'::TEXT, 'ALTA'::TEXT,
         'Contrato encerrado com saldo de caução pendente de devolução.'::TEXT,
         c.end_date
  FROM public.contract_guarantees g
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE g.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO'
    AND g.kind = 'CAUCAO' AND g.caucao_type = 'DINHEIRO'
    AND c.status = 'Encerrado'
    AND COALESCE((
      SELECT SUM(e.amount) FROM public.guarantee_deposit_events e
      WHERE e.guarantee_id = g.id
    ), 0) > 0.005

  UNION ALL
  -- (g) Renovação pendente de reanálise (garantia nunca é herdada).
  SELECT c.id, c.number, c.title, g.id,
         'REANALISE_PENDENTE'::TEXT, 'ALTA'::TEXT,
         'Contrato renovado: a garantia precisa de reanálise antes de ser reaproveitada.'::TEXT,
         c.start_date
  FROM public.contract_guarantees g
  JOIN public.contracts c ON c.id = g.contract_id
  WHERE g.organization_id = ANY(v_targets)
    AND g.scope = 'LOCACAO'
    AND g.requires_reanalysis;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rental_guarantee_alerts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rental_guarantee_alerts(uuid) TO authenticated;
