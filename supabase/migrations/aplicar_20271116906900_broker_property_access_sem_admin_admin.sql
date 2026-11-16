-- ==========================================================================
-- fn_set_broker_property_access — tira o e-mail `admin@admin.com` da
-- autorização da RPC (o que aplicar_20271018480000 fez só nas políticas)
-- Date: 2026-11-15
-- ==========================================================================
-- O risco: a RPC é SECURITY DEFINER, executável por `authenticated`, e
-- liberava quem NÃO é membro da organização da propriedade desde que o token
-- trouxesse o e-mail `admin@admin.com`:
--     IF NOT FOUND OR NOT (public.is_org_member(v_org_id)
--                          OR auth.jwt()->>'email' = 'admin@admin.com') THEN
-- O domínio admin.com é de terceiros — confirmação ou troca de senha chegaria
-- a quem controla esse domínio, que poderia ligar o próprio corretor a um
-- empreendimento de QUALQUER organização (fn_broker_portal_get_units passa a
-- listar unidades e tabela de preço daquele empreendimento no link dele).
-- aplicar_20271018480000 tirou esse mesmo OU das 16 políticas (inclusive
-- broker_property_access_manage, a regra que esta RPC replica) e a trava dela
-- só olha pg_policies — por isso a função ficou de fora.
--
-- Correção: a definição vigente (20270822000015, a única — nenhuma migration
-- posterior redefine a função) copiada sem mudança, exceto a condição de
-- autorização, que perde o OU do e-mail e fica só `is_org_member(v_org_id)` —
-- a mesma regra de broker_property_access_manage hoje.
--
-- Quem continua passando (nada muda para conta legítima):
--   · membro da organização da propriedade (Vendas de Ativos e Locações,
--     brokerService.setPropertyAccess) — mesma checagem de antes;
--   · superadmins (public.superadmins): são `owner` em TODA organização
--     (aplicar_20271024950000: backfill + gatilho trg_org_inclui_superadmins),
--     logo is_org_member já é verdadeiro para eles. `is_superadmin()` não entra
--     de propósito: deixaria a RPC mais larga que a política da própria tabela.
-- Quem deixa de passar: só um token com e-mail `admin@admin.com` sem vínculo
-- com a organização. Essa conta foi apagada em 18/10/2026 (nunca entrou, e-mail
-- nunca confirmado — docs/planos/2026-10-18-asaas-seguranca-chaves-pix.md,
-- item 4) e nenhum código, teste ou seed do app usa esse e-mail.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): só RESTRINGE — sai a perna do e-mail; nenhuma
--   perna nova.
--   Pergunta 2 (quem executa): ACL igual à que o banco já tem desde
--   aplicar_20270916000001 (sem PUBLIC, sem anon, EXECUTE para authenticated),
--   reafirmada aqui de forma literal. SECURITY DEFINER e `SET search_path`
--   mantidos.
--
-- Idempotente (CREATE OR REPLACE + REVOKE/GRANT). A trava no fim desfaz tudo se
-- o corpo da função ainda citar o e-mail.
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

BEGIN;

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

    IF NOT FOUND OR NOT public.is_org_member(v_org_id) THEN
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

REVOKE EXECUTE ON FUNCTION public.fn_set_broker_property_access(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_set_broker_property_access(UUID, UUID, BOOLEAN) TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND p.proname = 'fn_set_broker_property_access'
                  AND p.prosrc ILIKE '%admin@admin.com%') THEN
        RAISE EXCEPTION 'fn_set_broker_property_access ainda cita admin@admin.com — nada foi alterado.';
    END IF;
END $$;

COMMIT;

-- ==========================================================================
-- Conferência depois de aplicar
-- ==========================================================================
-- a. A função não cita mais o e-mail e a ACL ficou sem PUBLIC/anon:
-- SELECT position('admin@admin.com' in p.prosrc) = 0 AS sem_email,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_pode,   -- f
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,     -- t
--        p.proconfig                                                               -- {search_path=public}
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'fn_set_broker_property_access';
--
-- b. Nenhuma OUTRA função do schema public cita o e-mail (a trava de
--    aplicar_20271018480000 só olhava pg_policies):
-- SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosrc ILIKE '%admin@admin.com%';
--    -> esperado: 0 linhas
-- ==========================================================================
-- FIM
-- ==========================================================================
