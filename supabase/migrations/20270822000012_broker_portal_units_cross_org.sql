-- ==========================================================================
-- fn_broker_portal_get_units — habilitação cross-org (corretor de holding,
-- empreendimento na SPE)
-- Date: 2026-07-22
-- ==========================================================================
-- Bug: a versão anterior (20270822000011) restringia TUDO a
-- p.organization_id = v_tok.org_id antes de aplicar broker_property_access.
-- Mas broker_profiles pode estar cadastrado numa org "holding" (ex: Alpa
-- Construtora) enquanto o prédio do empreendimento vive na SPE própria dele
-- (ex: "Construção do Edifício Garden Cambuhy SPE") — já é o padrão adotado
-- para negociações (ver comentário em brokerService.listProfiles, decisão
-- 2026-07-21). Resultado: habilitar o corretor num prédio de outra org nunca
-- aparecia no link público, porque v_tok.org_id não batia com o prédio.
--
-- Correção: o filtro por org do token só vale para a regra de "unidade
-- avulsa sempre visível" (sem isso, unidade solta de org nenhuma relação
-- vazaria pra qualquer token). A regra de broker_property_access passa a
-- valer para qualquer org — é uma concessão explícita feita por um membro da
-- org do prédio (RLS de broker_property_access já exige isso na escrita).
--
-- Só substitui o corpo da função. Idempotente. NUNCA `supabase db push`.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_units(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'units', COALESCE(
            (SELECT jsonb_agg(row_to_json(p))
             FROM public.commercial_properties p
             WHERE (
                 (p.organization_id = v_tok.org_id AND p.parent_id IS NULL AND p.type <> 'BUILDING')
                 OR EXISTS (
                     SELECT 1 FROM public.broker_property_access a
                     WHERE a.broker_id = v_tok.broker_id
                       AND a.enabled = TRUE
                       AND a.property_id = COALESCE(p.parent_id, p.id)
                 )
             )),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) TO anon, authenticated;
