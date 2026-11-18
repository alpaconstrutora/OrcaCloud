-- ════════════════════════════════════════════════════════════════════════════
-- Corretor deixa de contar como MEMBRO da organização (18/11/2026)
-- 2ª de 2 migrations — achados F5, F6 e F7 da varredura de segurança de 15/11/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Plano: docs/planos/2026-11-18-seguranca-corretor-nao-membro.md
--
-- ⚠️ ORDEM — só aplicar DEPOIS de:
--   1. aplicar_20271118913000_corretor_caminho_proprio.sql aplicada, e
--   2. o front do mesmo PR no ar (aba Saúde e "Reservar" pelas RPCs novas).
--   Aplicada antes do front, o corretor logado perde a aba Saúde (zera) e o
--   "Reservar" (erro) até o deploy. Enviar proposta só depende da 1ª migration.
--
-- O QUE FECHA
--   is_org_member, minhas_orgs_membro e is_org_member_de tinham um 2º ramo:
--   "broker_profiles ATIVO com o e-mail do JWT = membro". ~640 policies usam
--   minhas_orgs_membro/is_org_member, então o corretor externo lia e gravava a
--   organização inteira (folha, salário, extrato, contas bancárias, tokens de
--   portal) direto pela API — F5/F6. E qualquer membro (ou o próprio corretor, por
--   broker_profiles_manage) criava broker_profiles para um e-mail qualquer, que
--   virava "membro" pelo mesmo ramo — F7.
--   rh_kpis (SECURITY DEFINER) tinha CÓPIA do ramo no próprio portão: corretor
--   recebia os KPIs de RH da organização. Sai também.
--   Depois daqui: broker_profiles não dá organização a ninguém. O corretor fica com
--   as RPCs por token do portal (fn_broker_portal_*) e com o que a 1ª migration
--   deu (proposta própria, reservar, Saúde).
--
-- O QUE NÃO MUDA (de propósito)
--   · As funções INVOKER de BI/financeiro que têm cópia do ramo no portão
--     (fn_cash_flow, fn_dre*, fn_bi_*, fn_opura_*, fn_reconciliation_*, …, 24 no
--     total): são SECURITY INVOKER e TODA tabela do schema public tem RLS (e toda
--     view é security_invoker) — depois daqui a RLS devolve zero linha ao corretor
--     mesmo que ele passe pelo portão. Limpar o texto delas fica para depois.
--   · fn_unit_cost_basis continua barrando corretor (agora já no is_org_member).
--   · Quem pode CRIAR broker_profiles (broker_profiles_manage = membro): pergunta de
--     produto em aberto no plano — restringir a owner/admin muda o fluxo de quem
--     cadastra corretor/fornecedor hoje.
--
-- ANTES DE APLICAR — quem perde acesso (pessoa da casa cadastrada SÓ como corretor):
--   SELECT bp.name, lower(bp.email) AS email, o.name AS org, bp.creci, bp.agency_name,
--          to_char(u.last_sign_in_at, 'YYYY-MM-DD') AS ultimo_login
--     FROM public.broker_profiles bp
--     JOIN auth.users u ON lower(u.email) = lower(bp.email)
--     LEFT JOIN public.organizations o ON o.id = bp.organization_id
--    WHERE bp.is_active = true AND bp.organization_id IS NOT NULL
--      AND NOT EXISTS (
--            SELECT 1 FROM public.organization_members om
--             WHERE om.organization_id = bp.organization_id
--               AND ((om.user_id IS NOT NULL AND om.user_id = u.id)
--                 OR (om.user_id IS NULL AND lower(om.email) = lower(u.email))));
--   Em 18/11/2026: ZERO linhas (41 corretores ativos; só 1 tem conta no Auth e ele
--   já é membro, admin, da mesma organização). Se aparecer alguém e o usuário decidir
--   que é funcionário, dar a ele uma linha em organization_members ANTES (preencher e
--   descomentar — decisão do usuário, nunca automática):
--   -- INSERT INTO public.organization_members (organization_id, user_id, email, name, role)
--   -- VALUES ('<org>', '<auth.users.id>', '<email>', '<nome>', 'member');
--
-- REGRA #7
--   Pergunta 1 (perna do OR): o que sai é justamente uma perna do OR que bastava
--   sozinha. As funções ficam com a perna de organization_members, igual a
--   minhas_orgs_equipe(), que já existe e é a mesma regra sem o corretor.
--   Pergunta 2 (quem executa): CREATE OR REPLACE mantém a ACL; os REVOKE/GRANT
--   abaixo só REPETEM a ACL de produção de hoje (lida em 18/11), para a trava do CI
--   e para quem ler o arquivo. anon segue executando is_org_member e
--   minhas_orgs_membro porque 124 policies são TO public (anon as avalia) — tirar o
--   EXECUTE trocaria "falso" por erro de permissão nessas tabelas. Para anon as duas
--   devolvem falso/vazio (sem uid, sem e-mail).
--
-- COMO CONFERIR DEPOIS DE APLICAR (deve dar 0 em tudo):
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--      AND p.proname IN ('is_org_member','minhas_orgs_membro','is_org_member_de','rh_kpis')
--      AND p.prosrc ~* 'FROM\s+public\.broker_profiles';
--   (procura a LEITURA da tabela, não o nome: o comentário novo dentro das funções
--   cita broker_profiles para explicar por que ele não entra.)
--   E de fora, com a sessão de um corretor de teste (sem linha em
--   organization_members): GET /rest/v1/employees?select=id → [] ;
--   POST /rest/v1/rpc/rh_kpis {"p_org_id":"<org>"} → "Acesso negado".
--
-- VOLTA (se precisar): recriar as quatro funções com o ramo — o texto de antes está
--   em aplicar_20271111930000_is_org_member_jwt_uma_vez.sql (is_org_member),
--   aplicar_20271111940000_rls_extrato_titulos_por_conjunto.sql (minhas_orgs_membro)
--   e na definição de produção de 18/11 (is_org_member_de, rh_kpis), reproduzida no
--   plano. Two-way door: nada é apagado, só o texto das funções muda.
--
-- Idempotente (CREATE OR REPLACE). Cada função foi reescrita a partir da definição
-- de PRODUÇÃO de 18/11/2026 (pg_get_functiondef), tirando só o ramo do corretor.
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
-- ════════════════════════════════════════════════════════════════════════════


-- ─── is_org_member ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Uma leitura do JWT por chamada (antes: a cada linha examinada).
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt()->>'email');
BEGIN
  -- Preferência: user_id (auth.uid()) quando preenchido na tabela.
  -- Fallback: email para linhas legadas onde user_id é NULL.
  -- ⚠️ broker_profiles NÃO entra (18/11/2026, F5/F6/F7): corretor não é membro.
  -- O corretor tem caminho próprio — minhas_orgs_corretor() e as RPCs do portal.
  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND (
        (user_id IS NOT NULL AND user_id = v_uid)
        OR (user_id IS NULL AND LOWER(email) = v_email)
      )
  ) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO anon, authenticated, service_role;


-- ─── minhas_orgs_membro ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.minhas_orgs_membro()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Mesma lógica de is_org_member, em forma de conjunto.
  -- ⚠️ broker_profiles NÃO entra (18/11/2026, F5/F6/F7): corretor não é membro.
  -- As organizações em que sou corretor: public.minhas_orgs_corretor().
  SELECT m.organization_id
    FROM public.organization_members m
   WHERE m.organization_id IS NOT NULL
     AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
       OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt()->>'email')))
$function$;

REVOKE ALL ON FUNCTION public.minhas_orgs_membro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minhas_orgs_membro() TO anon, authenticated, service_role;


-- ─── is_org_member_de (membro de OUTRO usuário — rotinas do banco) ───────────
CREATE OR REPLACE FUNCTION public.is_org_member_de(p_user uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_email TEXT;
BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user;

    -- Preferência: user_id quando preenchido na tabela.
    -- Fallback: e-mail para linhas legadas onde user_id é NULL.
    -- ⚠️ broker_profiles NÃO entra (18/11/2026, F5/F6/F7): corretor não é membro.
    IF EXISTS (
        SELECT 1
          FROM public.organization_members om
         WHERE om.organization_id = p_org
           AND (
                 (om.user_id IS NOT NULL AND om.user_id = p_user)
              OR (om.user_id IS NULL AND lower(om.email) = lower(v_email))
           )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_org_member_de(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member_de(uuid, uuid) TO service_role;


-- ─── rh_kpis (cópia do ramo no portão de uma SECURITY DEFINER) ──────────────
CREATE OR REPLACE FUNCTION public.rh_kpis(p_org_id uuid, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_org_ids UUID[];
BEGIN
    -- Organizações do usuário (mesma regra de public.is_org_member).
    -- NULL = "Todas" = todas estas, nunca organization_id NULL.
    -- ⚠️ broker_profiles NÃO entra (18/11/2026, F6): corretor não vê KPI de RH.
    SELECT ARRAY(
        SELECT DISTINCT organization_id FROM public.organization_members
        WHERE (user_id IS NOT NULL AND user_id = auth.uid())
           OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    ) INTO v_org_ids;

    IF p_org_id IS NOT NULL AND NOT (p_org_id = ANY(v_org_ids)) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
    END IF;

    RETURN public.rh_kpis_calcular(
        CASE WHEN p_org_id IS NULL THEN v_org_ids ELSE ARRAY[p_org_id] END,
        p_ref_date);
END;
$function$;

REVOKE ALL ON FUNCTION public.rh_kpis(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_kpis(uuid, date) TO authenticated, service_role;


-- ─── RPCs da aba Saúde: anon fora ────────────────────────────────────────────
-- A 1ª migration (913000, já aplicada em 18/11) deu EXECUTE a anon nas duas, para
-- o painel do link anônimo seguir zerado. Para anon elas devolvem vazio, mas são
-- SECURITY DEFINER — e scripts/check-rls-postura.sh (verificação 3) não aceita
-- DEFINER executável por anon fora da allowlist. O front deste PR já não as chama
-- sem sessão (services/brokerHealthService.ts, temSessao): o painel anônimo sai
-- zerado sem ir ao banco. Por isso este REVOKE vem aqui, DEPOIS do front no ar.
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_saude(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_saude_empreendimentos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_saude(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_saude_empreendimentos(uuid) TO authenticated, service_role;
