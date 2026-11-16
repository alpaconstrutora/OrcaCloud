-- ════════════════════════════════════════════════════════════════════════════
-- CRÍTICO — `portal_tokens` (Portal do Colaborador) era listável com a chave pública
-- Mesmo defeito, mesma correção de `client_portal_tokens` (aplicar_20270919000004).
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- A policy `portal_tokens_public_select` (migration 20260528000011) é:
--
--     FOR SELECT USING (is_active = TRUE AND expires_at > NOW())
--
-- sem `TO`, portanto vale para PUBLIC — `anon` e QUALQUER autenticado, de
-- qualquer organização. A expressão descreve o ESTADO do token, não QUEM pode
-- lê-lo (Pergunta 1 da REGRA OBRIGATÓRIA #7): sozinha, libera toda linha viva
-- de todos os tenants. E `anon` mantém o SELECT padrão do Supabase na tabela.
--
--     GET /rest/v1/portal_tokens?select=token,employee_id,org_id   (chave do bundle)
--
-- O token É a credencial: alimenta `fn_colab_portal_*` (holerite, CPF, salário,
-- documentos de RH) e `academy_portal_*` (aceite, prova e conclusão de
-- treinamento obrigatório) do colaborador dono do link.
--
-- ── Por que dá para simplesmente remover ────────────────────────────────────
-- O comentário original ("necessário para o colaborador autenticar sem login")
-- não vale mais: toda a entrada anônima do portal passa por RPC
-- `SECURITY DEFINER`, que roda como dono e não depende de RLS nem de GRANT aqui —
-- portal_validate_token, fn_colab_portal_employee (e as fn_colab_portal_* que a
-- usam), fn_colab_portal_touch, fn_academy_portal_employee (e as
-- academy_portal_* que a usam).
--
-- Quem lê a tabela DIRETO, e por que continua funcionando:
--   • atsService.listPortalTokens / revokePortalToken (LaborPortal, tela de RH)
--     — membro autenticado da org, coberto por `portal_tokens_org_access`
--     (org_id IN minhas_orgs_membro()). Com a org "Todas" no topo passa a ver
--     só os links das orgs de que é membro, não mais os vivos de outros tenants;
--   • Edge Functions labor-portal-ged-download e academy-portal-media —
--     service_role, que não passa por RLS nem por GRANT.
--
-- ── Postura alvo ───────────────────────────────────────────────────────────
-- A mesma de `client_portal_tokens`: anon não tem NADA nesta tabela. Sobra a
-- policy de organização. `authenticated` NÃO é tocado.
--
-- ── O que esta migration NÃO faz (decisão do dono) ──────────────────────────
-- • Não invalida os links vivos. Eles ficaram legíveis enquanto a policy
--   existiu; se houver suspeita de coleta, regenerar os links ativos (botão
--   "Regenerar" na tela, ou portal_generate_token por colaborador) e reenviar.
-- • Não troca o token em texto claro por hash — a tela de RH usa o token para
--   montar e copiar o link; mudar isso é mudança de produto.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado).
-- Idempotente: pode rodar de novo.
-- ════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ═══ BLOCO 1 — a policy que liberava sem dizer para quem ════════════════════
DROP POLICY IF EXISTS "portal_tokens_public_select" ON public.portal_tokens;

-- ═══ BLOCO 2 — e o GRANT, que é a outra metade ══════════════════════════════
-- Sem o GRANT, o PostgREST recusa a chave pública antes de chegar na RLS —
-- defesa que não depende de ninguém lembrar da regra num `CREATE POLICY` futuro.
REVOKE ALL ON TABLE public.portal_tokens FROM anon;

COMMENT ON TABLE public.portal_tokens IS
    'Credencial do Portal do Colaborador. A coluna `token` abre holerites, documentos de RH e a Academia '
    'de um colaborador: NUNCA conceder leitura a anon nem policy sem recorte de organização. O acesso '
    'anônimo do portal passa por RPCs SECURITY DEFINER (portal_validate_token, fn_colab_portal_*, '
    'fn_academy_portal_employee), que não precisam de GRANT aqui. Ver migration 20271116900000.';

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Qualquer número fora do esperado = migration não aplicada inteira.
-- A prova que vale mesmo é de FORA, com a chave pública (scripts/check-rls-postura.sh, seção 9):
--   curl -s -H "apikey: $PUB" -H "Authorization: Bearer $PUB" \
--        "$URL/rest/v1/portal_tokens?select=token&limit=1"    # não pode devolver linha

SELECT
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.portal_tokens'::regclass
        AND polname = 'portal_tokens_public_select')                         AS policy_publica,      -- 0
    (SELECT COUNT(*) FROM pg_policy
      WHERE polrelid = 'public.portal_tokens'::regclass)                     AS policies_restantes,  -- 1
    (SELECT has_table_privilege('anon', 'public.portal_tokens', 'SELECT'))::TEXT
                                                                             AS anon_le,             -- false
    (SELECT has_table_privilege('authenticated', 'public.portal_tokens', 'SELECT'))::TEXT
                                                                             AS authenticated_le,    -- true
    (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.portal_tokens'::regclass)::TEXT                    AS rls_ligada;          -- true
