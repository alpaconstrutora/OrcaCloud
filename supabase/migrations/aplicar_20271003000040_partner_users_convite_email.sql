-- Portal do Parceiro › acesso por e-mail e senha, com convite por e-mail
--
-- Pedido do usuário em 03/10/2026: "portal do parceiro : alem do acesso via
-- token implementar acesso via e-mail". Decisões dele: e-mail e senha, com
-- convite; "Convidar Integrante" passa a mandar e-mail; entrada em
-- /portal-parceiro. Plano: docs/planos/2026-10-03-portal-parceiro-acesso-por-email.md
--
-- 1. partner_users.invited_at — quando o último convite foi enviado. Gravado
--    pela Edge Function partner-invite-user (service_role); a tela mostra
--    "Enviado em" / "Não enviado" e oferece "Reenviar convite".
--
-- 2. E-mail sempre minúsculo. O convite gravava o e-mail como foi digitado,
--    mas a autorização do modo logado compara letra a letra com o e-mail do JWT
--    (que o Supabase Auth guarda em minúsculas): partner_can_access_workspace,
--    a policy workspaces_select_external e partnerService.getPartnerUserByEmail.
--    Um convite com maiúscula entraria no login (validateAccess converte) e não
--    veria dado nenhum. O gatilho normaliza na escrita; o backfill acerta o que
--    já existe. Conferido antes de escrever (03/10/2026): 1 linha, já minúscula,
--    nenhuma colisão com UNIQUE (partner_workspace_id, email), nenhum e-mail em
--    mais de um workspace.
--
-- REGRA #7
--   Pergunta 1 (policy): nenhuma policy criada ou alterada.
--   Pergunta 2 (quem executa): partner_users_email_lower() é função de gatilho
--   (RETURNS trigger, SECURITY INVOKER) — não é chamável por RPC, mas o REVOKE
--   de PUBLIC vai junto, literal, como o padrão da casa e a trava de
--   segurancaMigrations conferem.

ALTER TABLE public.partner_users
    ADD COLUMN IF NOT EXISTS invited_at timestamptz;

COMMENT ON COLUMN public.partner_users.invited_at IS
    'Quando o último convite por e-mail foi enviado (Edge Function partner-invite-user). NULL = nunca enviado.';

CREATE OR REPLACE FUNCTION public.partner_users_email_lower()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.email := lower(trim(NEW.email));
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_users_email_lower() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS partner_users_email_lower ON public.partner_users;
CREATE TRIGGER partner_users_email_lower
    BEFORE INSERT OR UPDATE OF email ON public.partner_users
    FOR EACH ROW EXECUTE FUNCTION public.partner_users_email_lower();

UPDATE public.partner_users
   SET email = lower(trim(email))
 WHERE email <> lower(trim(email));
