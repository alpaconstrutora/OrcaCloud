-- Folha na organização DO COLABORADOR: acesso do assistente e fim da
-- ampliação por compartilhamento (11/10/2026)
--
-- Contexto: `aplicar_20271011000300` estendeu o compartilhamento de colaborador
-- (employee_org_shares) às 8 tabelas de RH/folha, para o fornecedor
-- alpaconstrutora@gmail.com — membro só da Alpa — editar a folha de Iago e
-- Clovis (Garden) no ciclo da Alpa. O usuário corrigiu o rumo no mesmo dia:
--   · "a folha deve ser gerada na organizacao do colaborador e nao do usuário";
--   · o fornecedor é o assistente administrativo contratado para cuidar da
--     folha — "caso específico que não deve ser tratado como geral".
-- Então: ele vira MEMBRO da Garden (a única outra org com colaboradores), com
-- as mesmas permissões que tem na Alpa, e as 8 policies voltam a exigir ser
-- membro da org (como antes de 0300). O `TO authenticated` de 0300 fica: nada
-- legítimo usava essas tabelas como anon (verificado em 11/10/2026).
--
-- FICA de 0300: a autorização dentro de update_employee_rubrics e
-- upsert_employee_allocations (eram SECURITY DEFINER sem checagem nenhuma) —
-- agora exigindo ser membro da org dona do colaborador.
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`. Idempotente.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ── 1. O assistente vira membro da Garden ─────────────────────────────────
INSERT INTO public.organization_members (organization_id, user_id, email, role, permissions, name, cargo, phone)
SELECT 'a2c4b292-48a1-42db-9e8a-a8defbec48a0', m.user_id, m.email, m.role, m.permissions, m.name, m.cargo, m.phone
  FROM public.organization_members m
 WHERE m.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
   AND lower(m.email) = 'alpaconstrutora@gmail.com'
   AND NOT EXISTS (
       SELECT 1 FROM public.organization_members x
        WHERE x.organization_id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0'
          AND lower(x.email) = 'alpaconstrutora@gmail.com');

-- ── 2. Acesso a dado de colaborador = membro da org DONA dele ─────────────
CREATE OR REPLACE FUNCTION public.can_access_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = p_employee_id
           AND public.is_org_member(e.org_id)
    );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_employee(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_employee(uuid) TO authenticated;

-- ── 3. As 8 policies voltam a "membro da org" ─────────────────────────────
DROP POLICY IF EXISTS payroll_events_v2_access ON public.payroll_events;
CREATE POLICY payroll_events_v2_access ON public.payroll_events
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS employee_automatic_rubrics_org_access ON public.employee_automatic_rubrics;
CREATE POLICY employee_automatic_rubrics_org_access ON public.employee_automatic_rubrics
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS employee_cost_splits_org_all ON public.employee_cost_splits;
CREATE POLICY employee_cost_splits_org_all ON public.employee_cost_splits
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS absences_org_access ON public.absences;
CREATE POLICY absences_org_access ON public.absences
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS vacation_balance_org_access ON public.vacation_balance;
CREATE POLICY vacation_balance_org_access ON public.vacation_balance
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS emp_salary_hist_org_access ON public.employee_salary_history;
CREATE POLICY emp_salary_hist_org_access ON public.employee_salary_history
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS allocations_org_access ON public.employee_allocations;
CREATE POLICY allocations_org_access ON public.employee_allocations
    FOR ALL TO authenticated
    USING (public.can_access_employee(employee_id)) WITH CHECK (public.can_access_employee(employee_id));

DROP POLICY IF EXISTS time_entries_org_access ON public.time_entries;
CREATE POLICY time_entries_org_access ON public.time_entries
    FOR ALL TO authenticated
    USING (public.can_access_employee(employee_id)) WITH CHECK (public.can_access_employee(employee_id));

-- ── 4. RPCs: autorização dentro continua, sem o ramo do compartilhamento ──
CREATE OR REPLACE FUNCTION public.update_employee_rubrics(p_employee_id uuid, p_rubric_codes text[], p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_access_employee(p_employee_id) OR NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Sem permissão para alterar as rubricas deste colaborador.'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.employee_automatic_rubrics
    WHERE employee_id = p_employee_id;

    IF array_length(p_rubric_codes, 1) > 0 THEN
        INSERT INTO public.employee_automatic_rubrics (employee_id, rubric_code, org_id)
        SELECT p_employee_id, code, p_org_id
        FROM   unnest(p_rubric_codes) AS code;
    END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) TO authenticated;
-- upsert_employee_allocations não muda de texto: chama can_access_employee,
-- que acima perdeu o ramo do compartilhamento.

DROP FUNCTION IF EXISTS public.employee_shared_in_home_org(uuid, uuid);

COMMIT;
