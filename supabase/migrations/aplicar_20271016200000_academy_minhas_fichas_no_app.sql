-- ============================================================
-- "Meus Treinamentos" (app) usa as mesmas RPCs do Portal de Treinamentos
-- Plano: docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md
--
-- Pedido (16/10/2026): dar a "Meus Treinamentos" as quatro abas do portal
-- (Meus treinamentos · Catálogo · Certificados · Histórico), com o catálogo de
-- inscrição.
--
-- As RPCs `academy_portal_user_*` (aplicar_20271015000200) resolvem "quem sou
-- eu" por um núcleo só, `fn_academy_portal_user_employees()`. Até aqui ele
-- reconhecia só as identidades do Portal de Treinamentos (academy_portal_users,
-- convite por e-mail). Passa a reconhecer TAMBÉM a ficha de colaborador do
-- usuário logado no app, com a MESMA regra de `academyService.getMyEmployeeId`:
--   1. `employees.user_id = auth.uid()` — vínculo explícito feito pelo RH na
--      ficha (campo "Usuário do sistema", 20270851000000);
--   2. e-mail igual ao do JWT, só para ficha SEM usuário vinculado e só se o
--      logado é membro da organização da ficha (`is_org_member`) — sem a
--      exigência de membro, quem criasse conta com um e-mail de colaborador
--      veria os treinamentos dele.
--
-- O que NÃO muda: `academy_portal_user_my_access()` (validação do login no
-- /portal-treinamentos) continua lendo só academy_portal_users — ter ficha de
-- colaborador não dá acesso ao portal sem convite.
--
-- REGRA #7: o núcleo continua sem grant (REVOKE de PUBLIC, anon e
-- authenticated); a autorização das cascas não muda — elas só enxergam o que o
-- núcleo devolve.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_academy_portal_user_employees()
RETURNS TABLE (portal_user_id UUID, org_id UUID, employee_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    -- Identidades do Portal de Treinamentos (convite por e-mail).
    SELECT u.id, u.org_id, u.employee_id
      FROM public.academy_portal_users u
     WHERE u.is_active
       AND u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND coalesce(auth.jwt() ->> 'email', '') <> ''
    UNION
    -- Ficha vinculada ao usuário do app pelo RH.
    SELECT NULL::UUID, e.org_id, e.id
      FROM public.employees e
     WHERE auth.uid() IS NOT NULL
       AND e.user_id = auth.uid()
    UNION
    -- Ficha sem usuário vinculado, casada pelo e-mail — só para membro da org dela.
    SELECT NULL::UUID, e.org_id, e.id
      FROM public.employees e
     WHERE e.user_id IS NULL
       AND coalesce(auth.jwt() ->> 'email', '') <> ''
       AND lower(e.email) = lower(auth.jwt() ->> 'email')
       AND public.is_org_member(e.org_id);
$$;
REVOKE ALL ON FUNCTION public.fn_academy_portal_user_employees() FROM PUBLIC, anon, authenticated;
