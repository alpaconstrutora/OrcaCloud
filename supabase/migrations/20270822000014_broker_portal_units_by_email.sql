-- ==========================================================================
-- fn_broker_portal_get_units — habilitação casa por e-mail do corretor, não
-- pelo id específico de uma linha de broker_profiles
-- Date: 2026-07-22
-- ==========================================================================
-- Bug: um corretor "Todas as organizações" é materializado em UMA linha de
-- broker_profiles POR organização (mesmo e-mail, ids diferentes — ver
-- supplierService.syncRealEstateBrokerProfile). O link público de cada
-- corretor é gerado a partir de uma tela (BrokerList) que pode estar noutra
-- organização ativa do que a do prédio sendo habilitado (SalesModule/
-- RentalsModule, que desde a correção do "corretor triplicado" escopa o
-- toggle pela org do PRÓPRIO prédio). Resultado: o admin habilita
-- broker_property_access.broker_id = <linha da org do prédio>, mas o token
-- do corretor (broker_portal_tokens.broker_id) aponta para a linha de OUTRA
-- organização — a comparação exata `a.broker_id = v_tok.broker_id` nunca
-- batia, então a habilitação "não funcionava" para corretores com mais de
-- uma linha.
--
-- Correção: casar broker_property_access pelo e-mail do corretor (via join
-- em broker_profiles), não pelo id da linha específica — mesmo padrão já
-- usado em todo o resto do Portal (propostas, leads, comissões usam
-- broker_email, não um id de linha).
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
                     SELECT 1
                     FROM public.broker_property_access a
                     JOIN public.broker_profiles bp2 ON bp2.id = a.broker_id
                     WHERE lower(bp2.email) = lower(v_bp.email)
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
