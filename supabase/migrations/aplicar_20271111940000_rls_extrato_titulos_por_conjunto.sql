-- ════════════════════════════════════════════════════════════════════════════
-- RLS do extrato e dos títulos: conjunto de organizações calculado UMA vez (11/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Plano (aprovado pelo usuário em 11/11/2026):
--   docs/planos/2026-11-11-rls-extrato-titulos-por-conjunto-de-orgs.md
--
-- Por quê: as policies "Manage … as member" chamavam is_org_member(organization_id)
-- POR LINHA. Medido como authenticated com JWT real, contagens iguais:
--   extrato (13.962 linhas): 625–774 ms de RLS por varredura × 3 ms por conjunto
--   títulos (2.232 linhas):  111–116 ms × 1 ms
-- Toda tela que lê o extrato pagava isso; o bootstrap da Central lê mais de uma vez.
--
-- O quê:
--   1. public.minhas_orgs_membro(): as organizações em que is_org_member daria
--      verdadeiro, com A MESMA lógica (organization_members por user_id ou, nas
--      linhas legadas sem user_id, por e-mail; broker_profiles ativo por e-mail).
--   2. As duas policies passam a `organization_id IN (SELECT minhas_orgs_membro())`
--      — subconsulta sem correlação: roda uma vez por consulta, cada linha é
--      conferida contra o conjunto. Nome, comando (ALL) e papel (authenticated)
--      ficam; internal_transactions mantém o WITH CHECK com a mesma expressão;
--      bank_transactions continua sem WITH CHECK explícito (como antes).
--   A policy de parceiro de internal_transactions NÃO muda. As outras ~610
--   policies com is_org_member ficam para depois (plano).
--
-- Equivalência provada antes (teste a seco desfeito, sem trava de tabela): para
-- todo usuário de organization_members/broker_profiles e um JWT vazio, em todas as
-- organizações, is_org_member(org) = (org IN (SELECT minhas_orgs_membro())).
-- organization_id NULL: is_org_member(NULL) é falso; NULL IN (…) é nulo → a linha
-- não passa nas duas formas.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): a expressão nova não tem OR — é a mesma pergunta,
--   "a org da linha é uma das minhas?", feita uma vez.
--   Pergunta 2 (quem executa): função NOVA → REVOKE de PUBLIC e anon; GRANT só a
--   authenticated (as duas policies são `TO authenticated`). Ela devolve só as
--   organizações do PRÓPRIO usuário do JWT.
--
-- TRAVA: ALTER POLICY pega trava exclusiva na tabela até o COMMIT — este arquivo é
-- só DDL (milissegundos). Não rodar dentro de transação longa.
--
-- VOLTA (se precisar):
--   ALTER POLICY "Manage bank_transactions as member" ON public.bank_transactions
--     USING (is_org_member(organization_id));
--   ALTER POLICY "Manage internal_transactions as member" ON public.internal_transactions
--     USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

CREATE OR REPLACE FUNCTION public.minhas_orgs_membro()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Mesma lógica de is_org_member (aplicar_20271111930000), em forma de conjunto.
  SELECT m.organization_id
    FROM public.organization_members m
   WHERE m.organization_id IS NOT NULL
     AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
       OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt()->>'email')))
  UNION
  -- Corretores (broker_profiles) não têm user_id — identificados por email.
  SELECT b.organization_id
    FROM public.broker_profiles b
   WHERE b.organization_id IS NOT NULL
     AND lower(b.email) = lower(auth.jwt()->>'email')
     AND b.is_active = true
$$;

REVOKE EXECUTE ON FUNCTION public.minhas_orgs_membro() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minhas_orgs_membro() TO authenticated;

ALTER POLICY "Manage bank_transactions as member" ON public.bank_transactions
  USING (organization_id IN (SELECT public.minhas_orgs_membro()));

ALTER POLICY "Manage internal_transactions as member" ON public.internal_transactions
  USING (organization_id IN (SELECT public.minhas_orgs_membro()))
  WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

-- Conferência depois de aplicar:
--   SELECT tablename, policyname, qual, with_check FROM pg_policies
--    WHERE policyname IN ('Manage bank_transactions as member', 'Manage internal_transactions as member');
