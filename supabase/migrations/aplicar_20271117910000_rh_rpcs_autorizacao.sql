-- ==========================================================================
-- RH: as 8 funções SECURITY DEFINER só agem na organização de quem chama; colaborador só é
-- criado, editado e apagado por membro da organização dona
-- Date: 2026-11-17
-- Plano: docs/planos/2026-11-17-rh-rpcs-autorizacao.md
-- Prova: scripts/teste-rh-rpcs-autorizacao.sql
-- Base:  definições vigentes no banco em 17/11 (= 20260528000002/07/09/10/12/15 com o search_path
--        de 20260706000003) e a policy employees_org_access vigente
-- ==========================================================================
-- Pedido do usuário (17/11/2026): "Sim", a "Começo pelas funções do RH?" — achados novos dos
-- revisores da varredura Claude Security de 15/11, fora dos 22 patches do #514.
--
-- O QUE MUDA
-- 1. hire_candidate, create_vacation_period, close_labor_diary, consolidate_evaluation_cycle,
--    esocial_create_batch, esocial_generate_s2200, esocial_get_dashboard e sst_indicators eram
--    SECURITY DEFINER sem conferir quem chama: qualquer usuário logado contratava candidato,
--    abria férias, fechava diário de mão de obra, consolidava avaliação e gerava eSocial em
--    QUALQUER organização, e lia o painel do eSocial e os indicadores de SST dela. Agora, quando
--    há usuário na requisição, a organização do registro (ou a passada) tem de estar em
--    minhas_orgs_membro() — a mesma regra da RLS de todas as tabelas que elas tocam. Recusa =
--    42501. Sem usuário (service_role, postgres) passa como antes; anon/PUBLIC não executam.
--    · create_vacation_period e os presentes do close_labor_diary: o colaborador tem de ser um que
--      quem chama enxerga (da org dele ou disponibilizado para uma delas) — a tela de férias usa a
--      org do topo e lista os disponibilizados.
--    · esocial_generate_s2200: a org DONA do colaborador (a admissão é dela), como a RLS de
--      esocial_events exigiria.
--    · Leitura com org nula ("Todas"): devolve zeros, como antes (REGRA #5).
-- 2. employees_org_access era FOR ALL sem WITH CHECK: o ramo do compartilhamento liberava a
--    gravação sozinho. Quem recebeu um colaborador disponibilizado o editava, apagava ou trazia
--    para a própria org; e o membro da org dona, disponibilizando o colaborador para uma org sua,
--    conseguia mudar o org_id dele para uma org de que NÃO é membro. Vira quatro policies: ver
--    igual a antes; criar, editar e apagar só membro da org dona, com a linha nova numa org dele.
-- Dados em 17/11: 4 períodos de férias (todos na org do colaborador), 2 candidatos, 0 diários com
-- trabalhador, tabelas de avaliação/eSocial/acidentes vazias; 15 compartilhamentos e 0 pessoas
-- que vêem um colaborador disponibilizado sem ser membro da org dona — nada existente fica de fora.
--
-- ROLLBACK
--   1. As 8 funções: o corpo de 20260528000002/07/09/10/12/15 (o mesmo desta migration sem as
--      linhas PERFORM public._rh_exige_*), mesma assinatura, SECURITY DEFINER, search_path
--      public, pg_temp; ACL igual (authenticated, service_role).
--   2. DROP FUNCTION public._rh_exige_org(uuid, text), public._rh_exige_colaborador(uuid);
--   3. DROP POLICY employees_select, employees_insert, employees_update, employees_delete ON public.employees;
--      CREATE POLICY employees_org_access ON public.employees FOR ALL
--        USING (COALESCE((org_id IN (SELECT minhas_orgs_membro())), false) OR is_employee_shared_with_user(id));
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── helpers (só chamados de dentro das funções abaixo) ───────────────────────

CREATE OR REPLACE FUNCTION public._rh_exige_org(p_org UUID, p_de_quem TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Sem usuário na requisição = chamada interna (service_role, postgres).
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;
    IF p_org IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'sem acesso: informe uma organização de que você é membro';
    END IF;
    IF p_org NOT IN (SELECT public.minhas_orgs_membro()) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = format('sem acesso: você não é membro da organização %s', p_de_quem);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._rh_exige_colaborador(p_employee UUID)
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
    -- O colaborador que a RLS de employees mostra: da org do usuário, ou disponibilizado
    -- (employee_org_shares) para uma org dele.
    IF NOT EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = p_employee
           AND (e.org_id IN (SELECT public.minhas_orgs_membro())
                OR EXISTS (SELECT 1 FROM public.employee_org_shares s
                            WHERE s.employee_id = e.id
                              AND s.target_org_id IN (SELECT public.minhas_orgs_membro())))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'sem acesso ao colaborador: não é de uma organização sua nem foi disponibilizado para uma delas';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._rh_exige_org(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rh_exige_colaborador(UUID) FROM PUBLIC, anon, authenticated;

-- ── hire_candidate ───────────────────────────────────────────────────────────

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

    -- Fechar vaga se quantidade atingida
    UPDATE public.job_openings
    SET status = 'FECHADA'
    WHERE id = v_candidate.job_id
      AND quantidade <= (
          SELECT COUNT(*) FROM public.candidates
          WHERE job_id = v_candidate.job_id AND stage = 'CONTRATADO'
      );

    RETURN v_emp_id;
END;
$function$;

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
    PERFORM public._rh_exige_colaborador(p_employee_id);

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
        -- O apontamento vai para o colaborador: só um que quem fecha enxerga (a recusa desfaz tudo).
        PERFORM public._rh_exige_colaborador(v_worker.employee_id);

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

-- ── consolidate_evaluation_cycle ─────────────────────────────────────────────

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

    -- Para cada avaliado, calcular notas consolidadas
    FOR v_emp IN
        SELECT DISTINCT evaluatee_id
        FROM public.evaluation_responses
        WHERE cycle_id = p_cycle_id AND status = 'CONCLUIDA'
    LOOP
        DECLARE
            v_nota_self   NUMERIC;
            v_nota_gestor NUMERIC;
            v_nota_pares  NUMERIC;
            v_nota_final  NUMERIC;
            v_class       TEXT;
        BEGIN
            SELECT AVG(nota_media) INTO v_nota_self   FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'SELF';
            SELECT AVG(nota_media) INTO v_nota_gestor FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo = 'GESTOR';
            SELECT AVG(nota_media) INTO v_nota_pares  FROM public.evaluation_responses WHERE cycle_id = p_cycle_id AND evaluatee_id = v_emp.evaluatee_id AND tipo IN ('PAR','SUBORDINADO');

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

-- ── esocial_create_batch ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.esocial_create_batch(p_org_id uuid, p_grupo text, p_per_apur text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_batch_id UUID;
    v_total    INTEGER := 0;
    v_ev       RECORD;
BEGIN
    PERFORM public._rh_exige_org(p_org_id, 'informada');

    INSERT INTO public.esocial_batches (org_id, grupo, per_apur)
    VALUES (p_org_id, p_grupo, p_per_apur)
    RETURNING id INTO v_batch_id;

    FOR v_ev IN
        SELECT id FROM public.esocial_events
        WHERE org_id = p_org_id AND grupo = p_grupo AND status = 'GERADO'
          AND (p_per_apur IS NULL OR per_apur = p_per_apur)
        ORDER BY gerado_em
        LIMIT 50   -- limite por lote conforme leiaute eSocial
    LOOP
        INSERT INTO public.esocial_batch_events (batch_id, event_id) VALUES (v_batch_id, v_ev.id);
        v_total := v_total + 1;
    END LOOP;

    UPDATE public.esocial_batches SET total_eventos = v_total WHERE id = v_batch_id;

    RETURN json_build_object('success', TRUE, 'batch_id', v_batch_id, 'total_eventos', v_total);
END;
$function$;

-- ── esocial_generate_s2200 ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.esocial_generate_s2200(p_employee_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_emp      public.employees;
    v_event_id UUID;
BEGIN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Colaborador não encontrado'); END IF;

    -- A admissão é da org DONA do colaborador (o evento é gravado nela).
    PERFORM public._rh_exige_org(v_emp.org_id, 'do colaborador');

    IF EXISTS (
        SELECT 1 FROM public.esocial_events
        WHERE org_id = v_emp.org_id AND tipo_evento = 'S-2200'
          AND entidade = 'employee' AND entidade_id = p_employee_id
          AND status NOT IN ('CANCELADO','EXCLUIDO')
    ) THEN
        RETURN json_build_object('error', 'Evento S-2200 já existe para este colaborador — use S-2206 para alterações');
    END IF;

    INSERT INTO public.esocial_events (
        org_id, tipo_evento, grupo, entidade, entidade_id, status
    ) VALUES (
        v_emp.org_id, 'S-2200', 'NAO_PERIODICOS', 'employee', p_employee_id, 'GERADO'
    ) RETURNING id INTO v_event_id;

    RETURN json_build_object('success', TRUE, 'event_id', v_event_id, 'tipo_evento', 'S-2200');
END;
$function$;

-- ── esocial_get_dashboard ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.esocial_get_dashboard(p_org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_pendentes   INTEGER;
    v_erros       INTEGER;
    v_aguardando  INTEGER;
    v_processados INTEGER;
    v_alertas     INTEGER;
BEGIN
    -- Org nula ("Todas") segue devolvendo zeros, como antes: leitura nunca bloqueia (REGRA #5).
    IF p_org_id IS NOT NULL THEN
        PERFORM public._rh_exige_org(p_org_id, 'informada');
    END IF;

    SELECT COUNT(*) INTO v_pendentes  FROM public.esocial_events WHERE org_id = p_org_id AND status = 'GERADO';
    SELECT COUNT(*) INTO v_erros      FROM public.esocial_events WHERE org_id = p_org_id AND status = 'ERRO';
    SELECT COUNT(*) INTO v_aguardando FROM public.esocial_events WHERE org_id = p_org_id AND status = 'AGUARDANDO';
    SELECT COUNT(*) INTO v_processados FROM public.esocial_events
        WHERE org_id = p_org_id AND status = 'PROCESSADO'
          AND DATE_TRUNC('month', processado_em) = DATE_TRUNC('month', NOW());
    SELECT COUNT(*) INTO v_alertas FROM public.esocial_pending_alerts
        WHERE org_id = p_org_id AND resolvida = FALSE;

    RETURN json_build_object(
        'pendentes',    v_pendentes,
        'erros',        v_erros,
        'aguardando',   v_aguardando,
        'processados_mes', v_processados,
        'alertas_abertos', v_alertas
    );
END;
$function$;

-- ── sst_indicators ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sst_indicators(p_org_id uuid, p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_total_accidents     INTEGER;
    v_with_leave          INTEGER;
    v_deaths              INTEGER;
    v_total_days_lost     INTEGER;
    v_hh_worked           NUMERIC;
    v_tfca                NUMERIC;   -- Taxa de Frequência com Afastamento
    v_tgca                NUMERIC;   -- Taxa de Gravidade
BEGIN
    -- Org nula ("Todas") segue devolvendo zeros, como antes: leitura nunca bloqueia (REGRA #5).
    IF p_org_id IS NOT NULL THEN
        PERFORM public._rh_exige_org(p_org_id, 'informada');
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE gravidade IN ('COM_AFASTAMENTO','INCAPACIDADE_PERMANENTE','OBITO')),
        COUNT(*) FILTER (WHERE gravidade = 'OBITO'),
        COALESCE(SUM(dias_afastamento), 0)
    INTO v_total_accidents, v_with_leave, v_deaths, v_total_days_lost
    FROM public.accidents
    WHERE org_id = p_org_id
      AND EXTRACT(YEAR FROM data_acidente) = p_year;

    -- Horas trabalhadas do ano (time_entries aprovadas)
    SELECT COALESCE(SUM(te.hours_worked), 0) INTO v_hh_worked
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = p_org_id
      AND te.status = 'APROVADO'
      AND EXTRACT(YEAR FROM te.date) = p_year;

    -- TFCA = (acidentes com afastamento / HH trabalhadas) * 1.000.000
    v_tfca := CASE WHEN v_hh_worked > 0 THEN ROUND((v_with_leave::NUMERIC / v_hh_worked) * 1000000, 2) ELSE 0 END;
    -- TGCA = (dias perdidos / HH trabalhadas) * 1.000.000
    v_tgca := CASE WHEN v_hh_worked > 0 THEN ROUND((v_total_days_lost::NUMERIC / v_hh_worked) * 1000000, 2) ELSE 0 END;

    RETURN json_build_object(
        'ano',              p_year,
        'total_acidentes',  v_total_accidents,
        'com_afastamento',  v_with_leave,
        'obitos',           v_deaths,
        'dias_perdidos',    v_total_days_lost,
        'hh_trabalhadas',   v_hh_worked,
        'tfca',             v_tfca,
        'tgca',             v_tgca
    );
END;
$function$;

-- ── privilégios das 8 (iguais aos de antes; explícitos pela REGRA #7) ────────

REVOKE ALL ON FUNCTION public.hire_candidate(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vacation_period(uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_labor_diary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consolidate_evaluation_cycle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.esocial_create_batch(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.esocial_generate_s2200(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.esocial_get_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sst_indicators(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hire_candidate(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_vacation_period(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_labor_diary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consolidate_evaluation_cycle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.esocial_create_batch(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.esocial_generate_s2200(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.esocial_get_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sst_indicators(uuid, integer) TO authenticated, service_role;

-- ── employees: ver igual; gravar só na org dona ──────────────────────────────

DROP POLICY IF EXISTS employees_org_access ON public.employees;
DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;

-- Ver: da org do usuário, ou disponibilizado para ele (employee_org_shares) — como antes.
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
    USING (COALESCE((org_id IN (SELECT public.minhas_orgs_membro())), false)
           OR public.is_employee_shared_with_user(id));

-- Criar: só numa org do usuário.
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated
    WITH CHECK (COALESCE((org_id IN (SELECT public.minhas_orgs_membro())), false));

-- Editar: só membro da org dona, e a linha continua numa org dele (mover = membro das duas).
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated
    USING (COALESCE((org_id IN (SELECT public.minhas_orgs_membro())), false))
    WITH CHECK (COALESCE((org_id IN (SELECT public.minhas_orgs_membro())), false));

-- Apagar: só membro da org dona.
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated
    USING (COALESCE((org_id IN (SELECT public.minhas_orgs_membro())), false));

COMMIT;
