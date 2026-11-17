-- ==========================================================================
-- RH: revisão da trava das funções DEFINER (achados da revisão independente de 17/11)
-- Date: 2026-11-17
-- Plano: docs/planos/2026-11-17-rh-rpcs-autorizacao.md (seção Revisão independente)
-- Prova: scripts/teste-rh-rpcs-autorizacao.sql
-- Base:  aplicar_20271117910000_rh_rpcs_autorizacao.sql (aplicada)
-- ==========================================================================
-- O QUE MUDA
-- 1. consolidate_evaluation_cycle somava respostas de QUALQUER organização gravadas no ciclo: a
--    RLS de evaluation_responses só confere o org_id da resposta (cycle_id é só FK), então um
--    membro de outra org que soubesse o id do ciclo mudava a nota final dos colaboradores daqui e
--    criava resultado para colaborador dele. As 4 leituras de respostas passam a filtrar a org do
--    ciclo.
-- 2. hire_candidate fechava a vaga contando candidatos CONTRATADOS de qualquer organização (mesma
--    brecha, em candidates.job_id). A contagem passa a filtrar a org do candidato.
-- 3. _rh_exige_colaborador(colaborador) aceitava colaborador disponibilizado para QUALQUER org do
--    usuário, não para a org do registro. Vira _rh_exige_colaborador(colaborador, org, de_quem):
--    o colaborador tem de ser DA org do registro (período de férias, diário) ou disponibilizado
--    PARA ela. A versão de 1 argumento sai; create_vacation_period e close_labor_diary passam a
--    chamar a nova.
-- Dados em 17/11: tabelas de avaliação vazias; 2 candidatos; 4 períodos de férias, todos na org do
-- colaborador; 0 trabalhadores em diário — nada existente muda.
--
-- ROLLBACK
--   Reaplicar de aplicar_20271117910000_rh_rpcs_autorizacao.sql: _rh_exige_colaborador(uuid) com o
--   REVOKE dela, e as 4 funções hire_candidate, create_vacation_period, close_labor_diary e
--   consolidate_evaluation_cycle; depois DROP FUNCTION public._rh_exige_colaborador(uuid, uuid, text).
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── helper de colaborador: da org do registro, ou disponibilizado para ela ──

CREATE OR REPLACE FUNCTION public._rh_exige_colaborador(p_employee UUID, p_org UUID, p_de_quem TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;
    -- p_org já passou por _rh_exige_org (é uma org do usuário) em quem chama.
    IF NOT EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = p_employee
           AND (e.org_id = p_org
                OR EXISTS (SELECT 1 FROM public.employee_org_shares s
                            WHERE s.employee_id = e.id AND s.target_org_id = p_org))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = format('sem acesso ao colaborador: não é da organização %s nem foi disponibilizado para ela', p_de_quem);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._rh_exige_colaborador(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── create_vacation_period ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_vacation_period(p_employee_id uuid, p_org_id uuid, p_hire_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    PERFORM public._rh_exige_org(p_org_id, 'informada');
    PERFORM public._rh_exige_colaborador(p_employee_id, p_org_id, 'informada');

    INSERT INTO public.vacation_balance (
        org_id, employee_id, periodo_inicio, periodo_fim, dias_direito
    ) VALUES (
        p_org_id,
        p_employee_id,
        p_hire_date,
        p_hire_date + INTERVAL '1 year' - INTERVAL '1 day',
        30
    )
    ON CONFLICT (employee_id, periodo_inicio) DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

-- ── close_labor_diary ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_labor_diary(p_diary_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_diary     public.labor_diary_entries;
    v_worker    public.labor_diary_workers;
    v_emp       public.employees;
    v_inserted  INTEGER := 0;
    v_skipped   INTEGER := 0;
BEGIN
    SELECT * INTO v_diary FROM public.labor_diary_entries WHERE id = p_diary_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Diário não encontrado');
    END IF;

    PERFORM public._rh_exige_org(v_diary.org_id, 'do diário de mão de obra');

    IF v_diary.status = 'FECHADO' AND v_diary.batch_generated THEN
        RETURN json_build_object('success', FALSE, 'error', 'Diário já fechado e lote gerado');
    END IF;

    -- Para cada trabalhador presente no diário
    FOR v_worker IN
        SELECT * FROM public.labor_diary_workers
        WHERE diary_entry_id = p_diary_id AND presente = TRUE
    LOOP
        -- O apontamento vai para o colaborador: só um da org do diário ou disponibilizado para ela
        -- (a recusa desfaz tudo).
        PERFORM public._rh_exige_colaborador(v_worker.employee_id, v_diary.org_id, 'do diário de mão de obra');

        SELECT * INTO v_emp FROM public.employees WHERE id = v_worker.employee_id;

        -- Inserir time_entry (ignora duplicatas pelo unique index)
        BEGIN
            INSERT INTO public.time_entries (
                employee_id, project_id, project_name, team_id,
                date, hours_worked, overtime_hours, hourly_rate,
                status, entry_method, notes
            ) VALUES (
                v_worker.employee_id,
                v_diary.project_id,
                v_diary.project_name,
                v_diary.team_id,
                v_diary.data,
                v_worker.horas_trabalhadas,
                v_worker.horas_extras,
                COALESCE(v_emp.hourly_cost, 0),
                'PENDENTE',
                'app',
                'Gerado automaticamente pelo diário de obra'
            );
            v_inserted := v_inserted + 1;
        EXCEPTION WHEN unique_violation THEN
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    -- Calcular total HH e fechar
    UPDATE public.labor_diary_entries
    SET
        status          = 'FECHADO',
        batch_generated = TRUE,
        total_hh        = (
            SELECT COALESCE(SUM(horas_trabalhadas + horas_extras), 0)
            FROM public.labor_diary_workers
            WHERE diary_entry_id = p_diary_id AND presente = TRUE
        ),
        updated_at = NOW()
    WHERE id = p_diary_id;

    RETURN json_build_object(
        'success',   TRUE,
        'inserted',  v_inserted,
        'skipped',   v_skipped,
        'total_hh',  (SELECT total_hh FROM public.labor_diary_entries WHERE id = p_diary_id)
    );
END;
$function$;

-- A versão de 1 argumento: ninguém mais chama (as duas acima foram as únicas).
DROP FUNCTION IF EXISTS public._rh_exige_colaborador(UUID);

-- ── hire_candidate: a contagem que fecha a vaga só conta candidatos da org ──

CREATE OR REPLACE FUNCTION public.hire_candidate(p_candidate_id uuid, p_hire_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_candidate public.candidates;
    v_job       public.job_openings;
    v_emp_id    UUID;
BEGIN
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id;
    IF FOUND THEN
        PERFORM public._rh_exige_org(v_candidate.org_id, 'do candidato');
    END IF;
    SELECT * INTO v_job       FROM public.job_openings WHERE id = v_candidate.job_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidato não encontrado';
    END IF;
    -- A vaga é lida (cargo, contrato, salário) e pode ser fechada: também tem de ser da org dele.
    PERFORM public._rh_exige_org(v_job.org_id, 'da vaga');

    -- Criar colaborador
    INSERT INTO public.employees (
        org_id, name, email, phone, cpf,
        contract_type, role, status, hire_date,
        base_salary
    ) VALUES (
        v_candidate.org_id,
        v_candidate.nome,
        v_candidate.email,
        v_candidate.telefone,
        v_candidate.cpf,
        COALESCE(v_job.tipo_contrato, 'CLT')::TEXT,
        v_job.cargo,
        'ATIVO',
        p_hire_date,
        COALESCE(v_candidate.pretensao_salarial, v_job.salario_min, 0)
    )
    RETURNING id INTO v_emp_id;

    -- Atualizar candidato
    UPDATE public.candidates
    SET stage = 'CONTRATADO', employee_id = v_emp_id, data_contratacao = p_hire_date
    WHERE id = p_candidate_id;

    -- Fechar vaga se quantidade atingida (só candidatos da org: outra org pode gravar candidato
    -- com job_id desta vaga — a RLS de candidates só confere o org_id do candidato)
    UPDATE public.job_openings
    SET status = 'FECHADA'
    WHERE id = v_candidate.job_id
      AND quantidade <= (
          SELECT COUNT(*) FROM public.candidates
          WHERE job_id = v_candidate.job_id AND stage = 'CONTRATADO'
            AND org_id = v_candidate.org_id
      );

    RETURN v_emp_id;
END;
$function$;

-- ── consolidate_evaluation_cycle: só respostas da org do ciclo ───────────────

CREATE OR REPLACE FUNCTION public.consolidate_evaluation_cycle(p_cycle_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cycle     public.evaluation_cycles;
    v_emp       RECORD;
    v_count     INTEGER := 0;
BEGIN
    SELECT * INTO v_cycle FROM public.evaluation_cycles WHERE id = p_cycle_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Ciclo não encontrado'); END IF;

    PERFORM public._rh_exige_org(v_cycle.org_id, 'do ciclo de avaliação');

    -- Para cada avaliado, calcular notas consolidadas. Só respostas da org do ciclo: outra org pode
    -- gravar resposta com cycle_id deste ciclo (a RLS de evaluation_responses só confere o org_id
    -- da resposta).
    FOR v_emp IN
        SELECT DISTINCT evaluatee_id
        FROM public.evaluation_responses
        WHERE cycle_id = p_cycle_id AND org_id = v_cycle.org_id AND status = 'CONCLUIDA'
    LOOP
        DECLARE
            v_nota_self   NUMERIC;
            v_nota_gestor NUMERIC;
            v_nota_pares  NUMERIC;
            v_nota_final  NUMERIC;
            v_class       TEXT;
        BEGIN
            SELECT AVG(nota_media) INTO v_nota_self   FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND org_id = v_cycle.org_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'SELF';
            SELECT AVG(nota_media) INTO v_nota_gestor FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND org_id = v_cycle.org_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'GESTOR';
            SELECT AVG(nota_media) INTO v_nota_pares  FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND org_id = v_cycle.org_id AND evaluatee_id = v_emp.evaluatee_id AND tipo IN ('PAR','SUBORDINADO');

            v_nota_final := ROUND(
                (COALESCE(v_nota_gestor,0)*0.5 + COALESCE(v_nota_self,0)*0.2 + COALESCE(v_nota_pares,0)*0.3)
                / NULLIF(
                    CASE WHEN v_nota_gestor IS NOT NULL THEN 0.5 ELSE 0 END +
                    CASE WHEN v_nota_self   IS NOT NULL THEN 0.2 ELSE 0 END +
                    CASE WHEN v_nota_pares  IS NOT NULL THEN 0.3 ELSE 0 END, 0
                ), 2
            );

            v_class := CASE
                WHEN v_nota_final >= 4.5 THEN 'DESTAQUE'
                WHEN v_nota_final >= 3.5 THEN 'ACIMA'
                WHEN v_nota_final >= 2.5 THEN 'ESPERADO'
                WHEN v_nota_final >= 1.5 THEN 'ABAIXO'
                ELSE 'CRITICO'
            END;

            INSERT INTO public.evaluation_results (org_id, cycle_id, employee_id, nota_self, nota_gestor, nota_pares, nota_final, classificacao)
            VALUES (v_cycle.org_id, p_cycle_id, v_emp.evaluatee_id, v_nota_self, v_nota_gestor, v_nota_pares, v_nota_final, v_class)
            ON CONFLICT (cycle_id, employee_id)
            DO UPDATE SET nota_self = EXCLUDED.nota_self, nota_gestor = EXCLUDED.nota_gestor,
                          nota_pares = EXCLUDED.nota_pares, nota_final = EXCLUDED.nota_final,
                          classificacao = EXCLUDED.classificacao;

            v_count := v_count + 1;
        END;
    END LOOP;

    UPDATE public.evaluation_cycles SET status = 'ENCERRADO', updated_at = NOW() WHERE id = p_cycle_id;

    RETURN json_build_object('success', TRUE, 'consolidados', v_count);
END;
$function$;

-- ── privilégios (iguais; explícitos pela REGRA #7) ───────────────────────────

REVOKE ALL ON FUNCTION public.hire_candidate(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vacation_period(uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_labor_diary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consolidate_evaluation_cycle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hire_candidate(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_vacation_period(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_labor_diary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consolidate_evaluation_cycle(uuid) TO authenticated, service_role;

COMMIT;
