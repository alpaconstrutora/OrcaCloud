-- Folha de colaborador COMPARTILHADO com outra organização (11/10/2026)
--
-- Por quê: `employee_org_shares` disponibiliza um colaborador para outras
-- organizações do grupo, mas o compartilhamento só abria a FICHA
-- (`employees`, via `is_employee_shared_with_user`). Tudo o que a folha usa em
-- volta continuava exigindo ser membro da organização DE ORIGEM do colaborador.
-- Caso real: o usuário fornecedor alpaconstrutora@gmail.com, membro só da Alpa
-- Construtora, abria o ciclo de folha da Alpa com Iago Marques e Clovis Mariano
-- da Rosa (da Garden Cambuhy SPE, compartilhados com a Alpa) e:
--   · lançar/editar evento → 42501 (o evento é gravado com o org_id do colaborador);
--   · os 3 eventos, a rubrica automática e a alocação existentes eram invisíveis;
--   · reprocessar o ciclo recalculava SEM eles — valor errado, calado.
--
-- O que muda: as 8 tabelas de RH/folha por colaborador ganham o ramo do
-- compartilhamento. Regra #7, pergunta 1 ("esta perna sozinha basta?"): o ramo
-- novo NÃO é "compartilhado com alguém" — exige linha explícita em
-- employee_org_shares apontando para uma org de que o usuário é membro, e, nas
-- tabelas com org_id, que a linha seja da org DONA do colaborador. Assim quem
-- recebe o colaborador emprestado lê e grava o que é dele, mas não consegue
-- plantar linha numa terceira organização qualquer.
--
-- `payroll_runs` NÃO muda de propósito: o ciclo é da organização; quem recebe
-- um colaborador emprestado gera a folha na SUA org, não na de origem.
--
-- Junto (Regra #7, pergunta 2): `update_employee_rubrics` e
-- `upsert_employee_allocations` eram SECURITY DEFINER sem autorização nenhuma
-- dentro — qualquer conta autenticada apagava e regravava rubricas/alocações de
-- colaborador de qualquer organização. Agora checam o mesmo acesso.
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`.
-- Idempotente (DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- lock_timeout curto: DDL de policy pega AccessExclusiveLock; se o app estiver
-- segurando a tabela, falha em 3 s e se tenta de novo, em vez de deadlockar.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Membro da org dona do colaborador, OU membro de uma org com que ele foi
-- compartilhado. Para tabelas sem org_id própria (ponto, alocações).
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
           )
        OR public.is_employee_shared_with_user(p_employee_id);
$$;

-- A linha é da org DONA do colaborador e ele está compartilhado com uma org de
-- que o usuário é membro. Para tabelas com org_id (eventos, rubricas, etc.).
CREATE OR REPLACE FUNCTION public.employee_shared_in_home_org(p_employee_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
               SELECT 1 FROM public.employees e
                WHERE e.id = p_employee_id
                  AND e.org_id = p_org_id
           )
       AND public.is_employee_shared_with_user(p_employee_id);
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_employee(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_employee(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.employee_shared_in_home_org(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.employee_shared_in_home_org(uuid, uuid) TO authenticated;

-- ── Tabelas com org_id ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS payroll_events_v2_access ON public.payroll_events;
CREATE POLICY payroll_events_v2_access ON public.payroll_events
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

DROP POLICY IF EXISTS employee_automatic_rubrics_org_access ON public.employee_automatic_rubrics;
CREATE POLICY employee_automatic_rubrics_org_access ON public.employee_automatic_rubrics
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

DROP POLICY IF EXISTS employee_cost_splits_org_all ON public.employee_cost_splits;
CREATE POLICY employee_cost_splits_org_all ON public.employee_cost_splits
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

DROP POLICY IF EXISTS absences_org_access ON public.absences;
CREATE POLICY absences_org_access ON public.absences
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

DROP POLICY IF EXISTS vacation_balance_org_access ON public.vacation_balance;
CREATE POLICY vacation_balance_org_access ON public.vacation_balance
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

DROP POLICY IF EXISTS emp_salary_hist_org_access ON public.employee_salary_history;
CREATE POLICY emp_salary_hist_org_access ON public.employee_salary_history
    FOR ALL TO authenticated
    USING      (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id))
    WITH CHECK (public.is_org_member(org_id) OR public.employee_shared_in_home_org(employee_id, org_id));

-- ── Tabelas sem org_id (o vínculo é só o colaborador) ──────────────────────

DROP POLICY IF EXISTS allocations_org_access ON public.employee_allocations;
CREATE POLICY allocations_org_access ON public.employee_allocations
    FOR ALL TO authenticated
    USING      (public.can_access_employee(employee_id))
    WITH CHECK (public.can_access_employee(employee_id));

DROP POLICY IF EXISTS time_entries_org_access ON public.time_entries;
CREATE POLICY time_entries_org_access ON public.time_entries
    FOR ALL TO authenticated
    USING      (public.can_access_employee(employee_id))
    WITH CHECK (public.can_access_employee(employee_id));

-- ── RPCs SECURITY DEFINER: autorização dentro ──────────────────────────────

CREATE OR REPLACE FUNCTION public.update_employee_rubrics(p_employee_id uuid, p_rubric_codes text[], p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_access_employee(p_employee_id)
       OR NOT (public.is_org_member(p_org_id) OR public.employee_shared_in_home_org(p_employee_id, p_org_id)) THEN
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

CREATE OR REPLACE FUNCTION public.upsert_employee_allocations(p_employee_id uuid, p_period text, p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_access_employee(p_employee_id) THEN
        RAISE EXCEPTION 'Sem permissão para alterar as alocações deste colaborador.'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.employee_allocations
    WHERE employee_id = p_employee_id
      AND reference_period = p_period;

    IF jsonb_array_length(p_allocations) > 0 THEN
        INSERT INTO public.employee_allocations
               (employee_id, project_id, allocation_percent, reference_period)
        SELECT p_employee_id,
               (item->>'project_id')::UUID,
               (item->>'allocation_percent')::NUMERIC,
               p_period
        FROM   jsonb_array_elements(p_allocations) AS item;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_employee_allocations(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_employee_allocations(uuid, text, jsonb) TO authenticated;

COMMIT;
