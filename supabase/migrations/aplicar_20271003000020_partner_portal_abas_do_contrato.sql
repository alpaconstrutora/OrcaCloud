-- Portal do Parceiro › abas visíveis do DETALHE DO CONTRATO
--
-- Pedido do usuário em 03/10/2026: "implementar a funcionalidade de configurar
-- abas visíveis (alem da geral existente), uam exclusiva para a aba Constratos".
-- Decisões dele: a lista vale POR PARCEIRO (todos os contratos do workspace) e
-- o botão fica na aba Contratos da visão do app.
--
-- A configuração mora em partner_workspaces.settings.partnerContractTabs (array
-- de ids das 7 sub-abas: overview, items, execucao, addendums, measurements,
-- retention, penalties), ao lado de partnerPortalTabs (configuração geral,
-- aplicar_20270929000020). App e parceiro logado leem o workspace com
-- `select('*')` e já recebem as duas; o LINK depende desta RPC.
--
-- O que muda: o objeto `workspace.settings` devolvido ao link ganha a chave
-- partnerContractTabs. Continua devolvendo SÓ as chaves de abas, nunca o
-- `settings` inteiro (o link roda como anon). Sem configuração, a chave vai
-- como null e o frontend trata como "todas" (utils/partnerPortalTabs.ts).
--
-- Corpo: cópia do corpo VIGENTE no banco em 03/10/2026 (pg_get_functiondef,
-- md5 fad251b51a3a41d54bbd41b812b17457) — idêntico ao publicado em 29/09 por
-- aplicar_20270929000020, conferido antes de escrever (memória da função de
-- portal sobrescrita por frente paralela). A única mudança é a linha 'settings'.
--
-- REGRA #7
--   Pergunta 1 (policy): nenhuma policy criada ou alterada.
--   Pergunta 2 (quem executa): SECURITY DEFINER e porta do link público — anon
--   PRECISA executar. REVOKE de PUBLIC (o default do Postgres) e GRANT explícito
--   a anon e authenticated, como já estava desde aplicar_20270929000020. A
--   autorização continua DENTRO da função: token ativo, não expirado, workspace
--   ativo.

CREATE OR REPLACE FUNCTION public.partner_portal_get_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok public.partner_portal_tokens;
    v_ws  RECORD;
BEGIN
    SELECT * INTO v_tok FROM public.partner_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;
    SELECT pw.*, s.name AS supplier_name INTO v_ws
    FROM public.partner_workspaces pw
    JOIN public.suppliers s ON s.id = pw.supplier_id
    WHERE pw.id = v_tok.workspace_id;
    IF NOT FOUND OR NOT v_ws.is_active THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;
    UPDATE public.partner_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;
    RETURN jsonb_build_object(
        'valid', TRUE,
        'org_id', v_tok.org_id,
        'workspace', jsonb_build_object(
            'id', v_ws.id,
            'organization_id', v_ws.organization_id,
            'supplier_id', v_ws.supplier_id,
            'supplier_name', v_ws.supplier_name,
            'is_active', v_ws.is_active,
            'settings', jsonb_build_object(
                'partnerPortalTabs', v_ws.settings -> 'partnerPortalTabs',
                'partnerContractTabs', v_ws.settings -> 'partnerContractTabs'
            )
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_get_data(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.partner_portal_get_data(text) TO anon, authenticated;
