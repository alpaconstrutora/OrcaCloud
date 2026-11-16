-- ════════════════════════════════════════════════════════════════════════════
-- ALTA — `broker_portal_tokens` era listável com a chave pública
-- Mesmo defeito, e mesma correção, de `client_portal_tokens` (20270919000004).
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- 1. A policy `broker_tokens_anon_select` (migration 20261224000001) é
--
--        FOR SELECT TO anon USING (is_active = TRUE AND expires_at > NOW())
--
--    A expressão descreve o ESTADO do token, não QUEM pode lê-lo (Pergunta 1
--    da REGRA OBRIGATÓRIA #7): sozinha, ela libera TODA linha viva de TODAS as
--    organizações. Com a chave que vai no bundle,
--
--        GET /rest/v1/broker_portal_tokens?select=token,broker_id,org_id
--
--    devolvia os tokens em texto claro. O token É a credencial: cada um abre o
--    Portal do Corretor daquele corretor (dados pessoais, leads, comissões,
--    propostas, tabela de preço) e escreve em nome dele (leads, chat, eventos).
--    A 20270208000002 preservou esta policy por "SELECT escopado por token
--    válido" — mas nada na expressão compara o token pedido.
--
-- 2. A policy `broker_tokens_auth_all` (FOR ALL TO authenticated) libera a
--    linha para `minhas_orgs_membro()`, e esse conjunto inclui de propósito o
--    CORRETOR identificado pelo e-mail do JWT (broker_profiles). Resultado: um
--    corretor logado pelo e-mail (portal_token_para_mim) listava — e podia
--    alterar — os tokens de todos os outros corretores da organização, e
--    entrava no portal de cada um.
--
-- ── Por que dá para fechar sem quebrar ninguém ──────────────────────────────
-- Toda a entrada do portal passa por RPC `SECURITY DEFINER`, que não depende
-- de policy nem de GRANT nesta tabela: broker_portal_get_data,
-- fn_broker_portal_* (corretor_do_token, get_units, get_price_table, leads,
-- chat, ...), portal_token_para_mim, portal_link_identidade e
-- broker_portal_generate_token. A Edge Function portal-invite-user usa
-- service_role. Quem lê a tabela DIRETO é só brokerPortalService
-- (getTokenForBroker / revokeToken), chamado pela tela Corretores
-- (BrokerList) — equipe da organização, que continua coberta abaixo.
--
-- ── Postura alvo ───────────────────────────────────────────────────────────
-- • anon: NADA nesta tabela (sem policy e sem GRANT — o PostgREST recusa antes
--   da RLS, como em client_portal_tokens).
-- • authenticated: só a EQUIPE da organização (organization_members), o mesmo
--   conjunto de minhas_orgs_membro() sem a perna do corretor por e-mail.
--   Membro da equipe que também é corretor segue vendo, pela perna da equipe.
--
-- O que muda de comportamento: quem só é "membro" por ser corretor ativo
-- (broker_profiles pelo e-mail) deixa de ler/gravar esta tabela direto. Nenhum
-- fluxo do app faz isso; o próprio token dele chega pelas RPCs acima.
--
-- Idempotente. Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado).
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ BLOCO 1 — a policy que liberava para anon sem dizer qual token ═════════
DROP POLICY IF EXISTS "broker_tokens_anon_select" ON public.broker_portal_tokens;

-- ═══ BLOCO 2 — e o GRANT, que é a outra metade ══════════════════════════════
-- Sem o GRANT, a tabela fica a um `CREATE POLICY` distraído de distância do
-- mesmo vazamento só na RLS; sem ele o PostgREST responde 401 antes.
-- `authenticated` NÃO é tocado: é por ele que a equipe vê e revoga os links.
REVOKE ALL ON TABLE public.broker_portal_tokens FROM anon;

-- ═══ BLOCO 3 — authenticated: só a equipe, não o corretor ═══════════════════
-- Mesma lógica da primeira perna de minhas_orgs_membro (aplicar_20271111940000),
-- em conjunto calculado uma vez por consulta (padrão do #382).
CREATE OR REPLACE FUNCTION public.minhas_orgs_equipe()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.organization_id
    FROM public.organization_members m
   WHERE m.organization_id IS NOT NULL
     AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
       OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt()->>'email')))
$$;

-- REGRA #7, Pergunta 2: só devolve as organizações do PRÓPRIO chamador.
REVOKE ALL ON FUNCTION public.minhas_orgs_equipe() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minhas_orgs_equipe() TO authenticated;

COMMENT ON FUNCTION public.minhas_orgs_equipe() IS
    'Organizações em que o usuário do JWT é EQUIPE (organization_members). Igual a minhas_orgs_membro() '
    'sem a perna do corretor por e-mail. Usada onde corretor não pode entrar (broker_portal_tokens). '
    'Ver migration 20271116900400.';

-- Recriada (e não ALTER) para não depender do estado anterior; mesmo nome,
-- comando e papel de antes — só o conjunto muda.
DROP POLICY IF EXISTS "broker_tokens_auth_all" ON public.broker_portal_tokens;
CREATE POLICY "broker_tokens_auth_all" ON public.broker_portal_tokens
    FOR ALL TO authenticated
    USING (org_id IN (SELECT public.minhas_orgs_equipe()))
    WITH CHECK (org_id IN (SELECT public.minhas_orgs_equipe()));

COMMENT ON TABLE public.broker_portal_tokens IS
    'Credencial do Portal do Corretor. A coluna `token` abre o portal inteiro de um corretor: '
    'NUNCA conceder leitura a anon nem a corretor. O acesso do portal passa por RPCs SECURITY DEFINER '
    '(broker_portal_get_data, fn_broker_portal_*, portal_token_para_mim), que não precisam de GRANT aqui. '
    'Ver migration 20271116900400.';

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Qualquer número fora do esperado = migration não aplicada inteira.
-- A prova que vale mesmo é de FORA, com a chave pública:
--   curl -s -o /dev/null -w '%{http_code}' -H "apikey: $PUB" -H "Authorization: Bearer $PUB" \
--        "$URL/rest/v1/broker_portal_tokens?select=token&limit=1"    # tem de dar 401

SELECT
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.broker_portal_tokens'::regclass
        AND polname = 'broker_tokens_anon_select')                           AS policy_anon,          -- 0
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.broker_portal_tokens'::regclass)              AS policies_restantes,   -- 1
    (SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
      WHERE polrelid = 'public.broker_portal_tokens'::regclass
        AND polname = 'broker_tokens_auth_all')                              AS auth_all_using,       -- … minhas_orgs_equipe() …
    (SELECT has_table_privilege('anon', 'public.broker_portal_tokens', 'SELECT'))::TEXT
                                                                             AS anon_le,              -- false
    (SELECT has_table_privilege('authenticated', 'public.broker_portal_tokens', 'SELECT'))::TEXT
                                                                             AS authenticated_le,     -- true
    (SELECT has_function_privilege('anon', 'public.minhas_orgs_equipe()', 'EXECUTE'))::TEXT
                                                                             AS anon_executa_equipe,  -- false
    (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.broker_portal_tokens'::regclass)::TEXT             AS rls_ligada;           -- true
