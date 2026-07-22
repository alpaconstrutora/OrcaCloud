-- ==========================================================================
-- fn_broker_portal_get_units — respeita broker_property_access (link público)
-- Date: 2026-07-22
-- ==========================================================================
-- Antes: retornava todas as commercial_properties da organização do token,
-- sem olhar para qual(is) empreendimento(s) aquele corretor está habilitado.
--
-- Agora: um prédio (type='BUILDING') ou uma unidade-filha (parent_id aponta
-- para o prédio) só aparece se houver linha em broker_property_access com
-- enabled=true para (v_tok.broker_id, <id do prédio>). Unidade avulsa (sem
-- parent_id e não é BUILDING) não pertence a nenhum empreendimento — segue
-- sempre visível, como antes.
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
             WHERE p.organization_id = v_tok.org_id
               AND (
                   (p.parent_id IS NULL AND p.type <> 'BUILDING')
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
