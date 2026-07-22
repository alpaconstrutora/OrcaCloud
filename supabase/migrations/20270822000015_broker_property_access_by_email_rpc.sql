-- ==========================================================================
-- fn_set_broker_property_access — desabilitar precisa desligar TODAS as
-- linhas do mesmo e-mail, não só a linha da organização aberta na tela
-- Date: 2026-07-22
-- ==========================================================================
-- Bug: fn_broker_portal_get_units (20270822000014) libera acesso casando
-- broker_property_access pelo E-MAIL do corretor (qualquer linha habilitada
-- já libera o link) — mas o toggle da tela (brokerService.setPropertyAccess)
-- só grava na linha de broker_profiles.id da organização ABERTA no momento
-- (Vendas de Ativos/Locações escopam pela org do prédio). Um corretor com
-- várias linhas (uma por organização, corretor "Todas as organizações") pode
-- ter ficado habilitado numa organização antiga — desabilitar na tela atual
-- desliga só a linha de HOJE, a linha antiga continua enabled=true, e o
-- EXISTS por e-mail em fn_broker_portal_get_units mantém o empreendimento
-- visível mesmo depois do toggle "desligado".
--
-- Correção: RPC SECURITY DEFINER que, dado um broker_id qualquer, resolve o
-- e-mail e aplica o enabled a TODAS as linhas de broker_profiles daquele
-- e-mail para aquela property_id — escrita atômica e consistente com a
-- leitura por e-mail. Autorização: exige que quem chama seja membro da
-- organização da PROPRIEDADE (mesma regra de broker_property_access_manage).
--
-- Nova função. Idempotente. NUNCA `supabase db push`.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_set_broker_property_access(
    p_broker_id UUID,
    p_property_id UUID,
    p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_email TEXT;
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.commercial_properties
    WHERE id = p_property_id;

    IF NOT FOUND OR NOT (public.is_org_member(v_org_id) OR auth.jwt()->>'email' = 'admin@admin.com') THEN
        RAISE EXCEPTION 'Sem permissão para alterar acesso desta propriedade.';
    END IF;

    SELECT email INTO v_email FROM public.broker_profiles WHERE id = p_broker_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Corretor não encontrado.';
    END IF;

    INSERT INTO public.broker_property_access (broker_id, property_id, enabled, updated_at)
    SELECT bp.id, p_property_id, p_enabled, timezone('utc', now())
    FROM public.broker_profiles bp
    WHERE lower(bp.email) = lower(v_email)
    ON CONFLICT (broker_id, property_id)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_set_broker_property_access(UUID, UUID, BOOLEAN) TO authenticated;
