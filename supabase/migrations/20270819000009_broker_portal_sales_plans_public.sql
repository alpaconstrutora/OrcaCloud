-- ==========================================================================
-- Plano de Vendas no Simulador do Portal do Corretor via LINK (token, sem login)
-- Date: 2026-07-20
-- ==========================================================================
-- CONTEXTO
-- BrokerProposalSimulator.tsx (aberto ao clicar numa unidade) carrega o plano
-- de vendas ativo via salesPlanService.listActive/validateSimulation — ambos
-- exigem sessao Supabase autenticada:
--   - sales_plans_select (20270717000000): RLS `TO authenticated` (is_org_member),
--     sem policy `TO anon`.
--   - fn_validate_sales_simulation (20270717000000): `GRANT ... TO authenticated`
--     + RAISE EXCEPTION se `is_org_member` for falso (auth.uid() nulo p/ anon).
--
-- Resultado: um corretor real, abrindo o link publico SEM estar logado no
-- Supabase Auth, nunca via o plano nem conseguia validar a simulacao — so'
-- "funcionava" em teste porque quem testava estava com sessao de admin ativa
-- no mesmo navegador. Corrigido aqui com o mesmo padrao de
-- fn_broker_portal_get_price_table (20270819000007): RPC SECURITY DEFINER que
-- troca is_org_member por conferencia via broker_portal_tokens.
--
-- Nao duplica as REGRAS de politica entre a versao autenticada e a por token:
-- extrai o corpo puro de fn_validate_sales_simulation para
-- fn_sales_simulation_checks(plano, payload), e as duas wrappers (autenticada
-- e por token) so' resolvem o plano + a checagem de posse antes de chamar essa
-- funcao comum. fn_validate_sales_simulation continua com o MESMO contrato
-- (assinatura, comportamento) de antes — so' o corpo interno mudou.
--
-- So' CREATE/REPLACE FUNCTION (sem ALTER em tabela) — aplicar tudo de uma vez
-- no SQL Editor. NUNCA `supabase db push`.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) Regras da politica, extraidas em funcao pura (recebe o plano ja
--    resolvido e confirmado — nao faz nenhuma checagem de organizacao sozinha).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sales_simulation_checks(p_plan public.sales_plans, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_checks        JSONB := '[]'::jsonb;
    v_overall       TEXT := 'ALLOWED';
    v_rank          INT := 0;   -- 0 ALLOWED, 1 WARN, 2 NEEDS_APPROVAL, 3 BLOCKED
    v_down_pct      NUMERIC := COALESCE((p_payload->>'down_payment_pct')::numeric, 0);
    v_installments  INT     := COALESCE((p_payload->>'installments')::int, 0);
    v_discount_pct  NUMERIC := COALESCE((p_payload->>'discount_pct')::numeric, 0);
    v_inst_value    NUMERIC := COALESCE((p_payload->>'installment_value')::numeric, 0);
    v_interm_count  INT     := COALESCE((p_payload->>'intermediary_count')::int, 0);
BEGIN
    IF p_plan.status <> 'active' THEN
        v_checks := v_checks || jsonb_build_object('rule','plan_status','verdict','BLOCKED',
            'message', format('Plano %s (nao ativo).', p_plan.status), 'limit', NULL, 'value', NULL);
        v_rank := GREATEST(v_rank, 3);
    ELSIF CURRENT_DATE < p_plan.effective_start
       OR (p_plan.effective_end IS NOT NULL AND CURRENT_DATE > p_plan.effective_end) THEN
        v_checks := v_checks || jsonb_build_object('rule','plan_validity','verdict','BLOCKED',
            'message','Plano fora do periodo de vigencia.', 'limit', NULL, 'value', NULL);
        v_rank := GREATEST(v_rank, 3);
    END IF;

    IF v_down_pct < p_plan.min_down_payment_pct THEN
        v_checks := v_checks || jsonb_build_object('rule','min_down_payment','verdict','NEEDS_APPROVAL',
            'message', format('Entrada %s%% abaixo do minimo %s%%.', v_down_pct, p_plan.min_down_payment_pct),
            'limit', p_plan.min_down_payment_pct, 'value', v_down_pct);
        v_rank := GREATEST(v_rank, 2);
    END IF;

    IF v_installments > p_plan.max_installments THEN
        v_checks := v_checks || jsonb_build_object('rule','max_installments','verdict','NEEDS_APPROVAL',
            'message', format('Prazo %sx acima do maximo %sx.', v_installments, p_plan.max_installments),
            'limit', p_plan.max_installments, 'value', v_installments);
        v_rank := GREATEST(v_rank, 2);
    END IF;

    IF v_discount_pct > p_plan.max_discount_pct THEN
        IF v_discount_pct > p_plan.max_discount_pct * 2 THEN
            v_checks := v_checks || jsonb_build_object('rule','max_discount','verdict','BLOCKED',
                'message', format('Desconto %s%% muito acima do maximo %s%%.', v_discount_pct, p_plan.max_discount_pct),
                'limit', p_plan.max_discount_pct, 'value', v_discount_pct);
            v_rank := GREATEST(v_rank, 3);
        ELSE
            v_checks := v_checks || jsonb_build_object('rule','max_discount','verdict','NEEDS_APPROVAL',
                'message', format('Desconto %s%% acima do maximo %s%%.', v_discount_pct, p_plan.max_discount_pct),
                'limit', p_plan.max_discount_pct, 'value', v_discount_pct);
            v_rank := GREATEST(v_rank, 2);
        END IF;
    END IF;

    IF p_plan.min_installment_value IS NOT NULL
       AND v_inst_value > 0 AND v_inst_value < p_plan.min_installment_value THEN
        v_checks := v_checks || jsonb_build_object('rule','min_installment_value','verdict','WARN',
            'message', format('Parcela abaixo do minimo de R$ %s.', p_plan.min_installment_value),
            'limit', p_plan.min_installment_value, 'value', v_inst_value);
        v_rank := GREATEST(v_rank, 1);
    END IF;

    IF v_interm_count > p_plan.max_intermediary_count THEN
        v_checks := v_checks || jsonb_build_object('rule','max_intermediary','verdict','WARN',
            'message', format('%s intermediarias acima do maximo %s.', v_interm_count, p_plan.max_intermediary_count),
            'limit', p_plan.max_intermediary_count, 'value', v_interm_count);
        v_rank := GREATEST(v_rank, 1);
    END IF;

    v_overall := CASE v_rank WHEN 3 THEN 'BLOCKED' WHEN 2 THEN 'NEEDS_APPROVAL'
                             WHEN 1 THEN 'WARN' ELSE 'ALLOWED' END;

    RETURN jsonb_build_object('overall', v_overall, 'checks', v_checks);
END;
$$;

-- Interna: nao faz checagem de organizacao sozinha — so' as duas wrappers
-- abaixo (autenticada e por token) devem chamá-la, depois de confirmar a posse
-- do plano. REVOKE PUBLIC/anon evita que alguem chame direto pulando a cerca.
REVOKE ALL ON FUNCTION public.fn_sales_simulation_checks(public.sales_plans, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sales_simulation_checks(public.sales_plans, JSONB) TO authenticated;

-- --------------------------------------------------------------------------
-- 2) fn_validate_sales_simulation (autenticada) — MESMO contrato de antes,
--    corpo agora delega pra fn_sales_simulation_checks.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_sales_simulation(
    p_plan_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.sales_plans%ROWTYPE;
BEGIN
    SELECT * INTO v_plan FROM public.sales_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plano de vendas nao encontrado.';
    END IF;
    IF NOT public.is_org_member(v_plan.organization_id) THEN
        RAISE EXCEPTION 'Sem permissao para esta organizacao.';
    END IF;
    RETURN public.fn_sales_simulation_checks(v_plan, p_payload);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_sales_simulation(UUID, JSONB) TO authenticated;

-- --------------------------------------------------------------------------
-- 3) fn_broker_portal_get_sales_plans — anon, planos ATIVOS do predio para o
--    Simulador no link publico. Mesmo padrao de fn_broker_portal_get_price_table:
--    token valida corretor+org; o building recebido e' conferido contra essa org.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_sales_plans(p_token TEXT, p_building_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok  public.broker_portal_tokens;
    v_bldg public.commercial_properties;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bldg
    FROM public.commercial_properties
    WHERE id = p_building_id AND organization_id = v_tok.org_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'plans', COALESCE(
            (SELECT jsonb_agg(row_to_json(sp) ORDER BY sp.created_at DESC)
             FROM public.sales_plans sp
             WHERE sp.building_id = p_building_id
               AND sp.organization_id = v_tok.org_id
               AND sp.status = 'active'),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_sales_plans(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_sales_plans(TEXT, UUID) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 4) fn_broker_portal_validate_sales_simulation — anon, mesma validacao de
--    fn_validate_sales_simulation, so' que a posse do plano e' conferida pelo
--    token (nunca is_org_member, que exige auth.uid()).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_validate_sales_simulation(
    p_token TEXT,
    p_plan_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tok  public.broker_portal_tokens;
    v_plan public.sales_plans%ROWTYPE;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_plan FROM public.sales_plans WHERE id = p_plan_id;
    IF NOT FOUND OR v_plan.organization_id <> v_tok.org_id THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object('valid', TRUE) || public.fn_sales_simulation_checks(v_plan, p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_validate_sales_simulation(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_validate_sales_simulation(TEXT, UUID, JSONB) TO anon, authenticated;
