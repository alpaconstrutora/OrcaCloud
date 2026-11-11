-- ════════════════════════════════════════════════════════════════════════════
-- is_org_member: lê o usuário do JWT UMA vez por chamada (11/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Sintoma: Central de Controle ("Bom dia") ~3,3 s depois de aplicar_20271111920000.
-- Medido: a chamada real gasta ~3,2 s DENTRO do banco (pg_stat_statements, delta de
-- 4 chamadas), mas a mesma função numa sessão de teste levava ~1,2 s. A diferença é
-- o JWT: o PostgREST 12 só define `request.jwt.claims` (587 bytes no JWT real), e
-- `auth.uid()` / `auth.jwt()` CONVERTEM esse JSON a cada chamada. Teste intercalado:
--   JWT real sem `request.jwt.claim.sub` (como o PostgREST)  2,12–2,15 s
--   JWT real com `request.jwt.claim.sub`                     1,19–1,20 s
--
-- `is_org_member` é a regra de 614 policies e roda POR LINHA (extrato bancário:
-- ~14 mil linhas). Antes: `auth.uid()` e `auth.jwt()->>'email'` dentro do WHERE,
-- reavaliados para cada linha de organization_members examinada, a cada chamada.
-- Agora: lidos uma vez no começo de cada chamada, em variáveis.
--
-- LÓGICA IDÊNTICA à de 20260706000002_fix_is_org_member_remove_backdoor.sql (corpo
-- conferido contra o banco por md5 em 11/11/2026): mesmas duas perguntas
-- (organization_members por user_id ou, nas linhas legadas sem user_id, por e-mail;
-- broker_profiles ativo por e-mail), mesma ordem. `auth.uid()`/`auth.jwt()` são
-- STABLE — o valor dentro de uma chamada é o mesmo; só deixamos de recalcular.
--
-- Teste a seco (transação desfeita), JWT no formato real, desenvolvedor@:
--   bootstrap da Central 2,39–2,67 s → 1,74–2,04 s;
--   is_org_member igual nas 7 organizações; os 6 blocos do bootstrap idênticos.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): nenhuma policy muda.
--   Pergunta 2 (quem executa): ACL MANTIDA DE PROPÓSITO — `CREATE OR REPLACE`
--   preserva {PUBLIC, anon, authenticated, service_role}. É o predicado avaliado
--   DENTRO das policies, inclusive nas leituras anônimas dos portais; revogar
--   quebraria essas policies. Devolve só um booleano sobre o PRÓPRIO usuário do
--   JWT — não expõe dado de ninguém.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Uma leitura do JWT por chamada (antes: a cada linha examinada).
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt()->>'email');
BEGIN
  -- Preferência: user_id (auth.uid()) quando preenchido na tabela.
  -- Fallback: email para linhas legadas onde user_id é NULL.
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
  -- Corretores (broker_profiles) não têm user_id — identificados por email.
  IF EXISTS (
    SELECT 1
    FROM public.broker_profiles
    WHERE organization_id = org_id
      AND LOWER(email) = v_email
      AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

-- Conferência depois de aplicar:
--   SELECT p.proconfig, p.proacl::text, position('v_uid' in p.prosrc) > 0 AS nova
--     FROM pg_proc p WHERE p.proname = 'is_org_member';
--   (proconfig = {search_path=public, pg_temp}; proacl com =X, anon=X, authenticated=X)
