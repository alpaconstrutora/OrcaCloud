-- Portal do Parceiro › abas visíveis configuráveis por workspace
--
-- Pedido do usuário em 29/09/2026: "implementar botao de configuracão de abas
-- visíveis da mesma forma que foi implementado em Portais < portal do
-- fornecedor (visão do app)".
--
-- A configuração mora em partner_workspaces.settings.partnerPortalTabs (array
-- de ids), gravada pela engrenagem da visão do app — a coluna `settings` já
-- existe e a policy workspaces_manage_internal já deixa o membro da org
-- atualizar. No app e no parceiro logado o portal lê o workspace com
-- `select('*')` e já recebe `settings`. O que faltava era o LINK: a RPC
-- partner_portal_get_data montava o objeto workspace campo a campo e não
-- devolvia `settings`, então o link mostraria sempre todas as abas.
--
-- O que muda: o objeto `workspace` ganha `settings`, com SÓ a chave
-- partnerPortalTabs. Não se devolve o `settings` inteiro de propósito — o link
-- roda como anon, e o que entrar em `settings` no futuro não deve vazar por
-- aqui sem alguém decidir. Sem configuração, a chave vai como null e o
-- frontend trata como "todas as abas" (utils/partnerPortalTabs.ts).
--
-- Corpo: cópia do corpo VIGENTE no banco em 29/09/2026 (pg_get_functiondef,
-- md5 3d2d92c60dd5007b8962f44894fd66fa, 1184 caracteres), não de migration
-- antiga — ver a memória da gêmea regredida do Portal do Parceiro. A única
-- mudança é a linha 'settings'.
--
-- REGRA #7
--   Pergunta 1 (policy): nenhuma policy criada ou alterada.
--   Pergunta 2 (quem executa): a função é SECURITY DEFINER e é a porta do link
--   público — anon PRECISA executar. A ACL vigente era
--   {=X/postgres, ..., anon=X, authenticated=X, ...}: o "=X" é o PUBLIC do
--   default do Postgres. Fica o REVOKE de PUBLIC e o GRANT explícito a anon e
--   authenticated, que é o acesso pretendido. A autorização continua DENTRO da
--   função: token ativo, não expirado, workspace ativo.

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
            'settings', jsonb_build_object('partnerPortalTabs', v_ws.settings -> 'partnerPortalTabs')
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_get_data(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.partner_portal_get_data(text) TO anon, authenticated;
