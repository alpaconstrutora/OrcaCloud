-- ════════════════════════════════════════════════════════════════════════════
-- CRÍTICO — `client_portal_tokens` era listável com a chave pública
-- Plano: docs/planos/2026-09-04-rls-client-portal-tokens.md
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- A policy `client_portal_tokens_public_select` (migration 20261128000001) é:
--
--     FOR SELECT USING (is_active = TRUE AND expires_at > now())
--
-- sem `TO`, portanto vale para PUBLIC — `anon` incluído — e `anon` tinha
-- SELECT na tabela. A expressão descreve o ESTADO do token, não QUEM pode
-- lê-lo: é a Pergunta 1 da REGRA OBRIGATÓRIA #7 ("esta perna sozinha basta
-- para liberar a linha?"). Sozinha, ela libera TODA linha viva.
--
-- Comprovado contra produção em 2026-09-03, com a publishable key que vai no
-- bundle do frontend (não é inferência):
--
--     GET /rest/v1/client_portal_tokens?select=client_id,token,expires_at
--     → 200, com os tokens em texto claro
--
-- O token É a credencial: `/portal-cliente?token=<uuid>` abre o portal inteiro
-- daquele cliente — financeiro, contratos, documentos do GED, dados da unidade.
-- Qualquer pessoa que abrisse o DevTools podia listar todos e entrar em todos.
--
-- ── Por que dá para simplesmente remover ────────────────────────────────────
-- O comentário original dizia "Leitura pública (necessária para validar sem
-- login)". Isso era verdade no desenho de 28/11/2026; hoje não é mais. Toda a
-- entrada anônima do portal passa por RPC `SECURITY DEFINER`, que ignora RLS —
-- conferido no banco antes de mexer, as 18 funções `client_portal_*`/
-- `fn_portal_*` são todas DEFINER, e `anon` executa só as de leitura do portal
-- (`client_portal_generate_token` já está fechada para anon desde a auditoria).
--
-- Quem lê a tabela DIRETO, e por que continua funcionando:
--   • clientPortalService.getTokenForClient/revokeToken — admin autenticado;
--   • condominioAcessoService.mapearPorCliente          — membro da org;
--   • ClientList (contagem de links no Dashboard)       — membro da org;
--     …os três cobertos por `client_portal_tokens_org_access` (is_org_member);
--   • Edge Function portal-ged-download                 — service_role, que
--     não passa por RLS nem por GRANT.
--
-- ── Postura alvo ───────────────────────────────────────────────────────────
-- A mesma de `condomino_portal_access`, que já responde 401 à chave pública:
-- anon não tem NADA nesta tabela. Sobra a policy de organização.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado).
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ BLOCO 1 — a policy que liberava sem dizer para quem ════════════════════
DROP POLICY IF EXISTS "client_portal_tokens_public_select" ON public.client_portal_tokens;

-- ═══ BLOCO 2 — e o GRANT, que é a outra metade ══════════════════════════════
-- Remover só a policy deixaria a tabela um `CREATE POLICY` distraído de
-- distância do mesmo vazamento. Sem o GRANT, o PostgREST responde 401 antes de
-- chegar na RLS — defesa que não depende de ninguém lembrar da regra depois.
-- `authenticated` NÃO é tocado: é por ele que o admin gerencia os links.
REVOKE ALL ON TABLE public.client_portal_tokens FROM anon;

COMMENT ON TABLE public.client_portal_tokens IS
    'Credencial do Portal do Cliente. A coluna `token` abre o portal inteiro de um cliente: '
    'NUNCA conceder leitura a anon. O acesso anônimo do portal passa por RPCs SECURITY DEFINER '
    '(client_portal_validate_token, client_portal_get_data, fn_portal_*), que não precisam de GRANT aqui. '
    'Ver migration 20270919000004.';

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Qualquer número fora do esperado = migration não aplicada inteira.
-- A prova que vale mesmo é de FORA, com a chave pública (ver o plano):
--   curl -s -o /dev/null -w '%{http_code}' -H "apikey: $PUB" -H "Authorization: Bearer $PUB" \
--        "$URL/rest/v1/client_portal_tokens?select=token&limit=1"    # tem de dar 401

SELECT
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.client_portal_tokens'::regclass
        AND polname = 'client_portal_tokens_public_select')                  AS policy_publica,      -- 0
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.client_portal_tokens'::regclass)              AS policies_restantes,  -- 1
    (SELECT has_table_privilege('anon', 'public.client_portal_tokens', 'SELECT'))::TEXT
                                                                             AS anon_le,             -- false
    (SELECT has_table_privilege('authenticated', 'public.client_portal_tokens', 'SELECT'))::TEXT
                                                                             AS authenticated_le,    -- true
    (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.client_portal_tokens'::regclass)::TEXT             AS rls_ligada;          -- true
