-- ============================================================================
-- RH › Colaborador — Histórico Salarial
-- Plano: docs/planos/2026-08-07-rh-colaborador-historico-salarial.md
--
-- Problema: employees.base_salary é um escalar único. Alterá-lo sobrescreve o
-- valor anterior sem nenhuma trilha — não dá para responder quanto a pessoa
-- ganhava antes, quando foi o último reajuste, nem se foi mérito ou dissídio.
--
-- Esta migration cria a trilha e a mantém em MÃO DUPLA com employees:
--   • lançar reajuste pela aba  -> fn_register_salary_change -> atualiza employees
--   • alterar base_salary por fora -> trigger -> grava linha no histórico
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. O histórico de schema_migrations está
--    furado desde 20270208* — NUNCA `supabase db push`.
-- ⚠️ Cria trigger em public.employees (tabela quente): pega ACCESS EXCLUSIVE
--    por um instante. Rodar fora do horário de pico.
-- ============================================================================

-- ─── 1a. Tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_salary_history (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    effective_date       DATE NOT NULL,
    previous_salary      NUMERIC(14,2),
    new_salary           NUMERIC(14,2) NOT NULL CHECK (new_salary >= 0),
    change_type          TEXT NOT NULL DEFAULT 'OUTRO' CHECK (change_type IN
                            ('ADMISSAO','MERITO','PROMOCAO','DISSIDIO',
                             'ENQUADRAMENTO','REDUCAO','AJUSTE','OUTRO')),
    -- contexto na época
    org_role_id          UUID REFERENCES public.org_roles(id) ON DELETE SET NULL,
    role_label           TEXT,   -- snapshot textual: sobrevive à exclusão do cargo
    jornada_horas_semana NUMERIC(5,2),
    contract_type        TEXT,
    -- anexo (termo de reajuste / aditivo)
    file_url             TEXT,
    file_name            TEXT,
    notes                TEXT,
    source               TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AUTO')),
    created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.employee_salary_history IS
  'Trilha de alterações salariais do colaborador. Fonte da verdade histórica; '
  'employees.base_salary guarda apenas o valor VIGENTE (effective_date <= hoje).';
COMMENT ON COLUMN public.employee_salary_history.source IS
  'MANUAL = lançado pela aba Histórico Salarial. AUTO = capturado pelo trigger '
  'quando employees.base_salary mudou por outro caminho (aba Geral, ATS, import, SQL).';
COMMENT ON COLUMN public.employee_salary_history.role_label IS
  'Cargo por extenso na época (employees.role). Redundante com org_role_id de '
  'propósito: o cargo pode ser excluído do catálogo e a trilha não pode perder o dado.';

CREATE INDEX IF NOT EXISTS idx_emp_salary_hist_employee
    ON public.employee_salary_history(employee_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_emp_salary_hist_org
    ON public.employee_salary_history(org_id);

-- Variação R$/% NÃO é coluna gerada — calculada na UI, evita guarda de divisão
-- por zero quando previous_salary é 0 ou NULL (admissão).

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Camada AUTHENTICATED explícita: `GRANT authenticated` sozinho não impede anon.

ALTER TABLE public.employee_salary_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emp_salary_hist_org_access" ON public.employee_salary_history;
CREATE POLICY "emp_salary_hist_org_access" ON public.employee_salary_history
    FOR ALL
    TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

REVOKE ALL ON public.employee_salary_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_salary_history TO authenticated;

-- updated_at: reusa a função já existente do módulo de mão de obra
DROP TRIGGER IF EXISTS trg_employee_salary_history_updated_at ON public.employee_salary_history;
CREATE TRIGGER trg_employee_salary_history_updated_at
    BEFORE UPDATE ON public.employee_salary_history
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ─── 1c. Sincronizar o salário VIGENTE de volta para employees ──────────────
-- Vigente = maior effective_date que JÁ CHEGOU (<= CURRENT_DATE).
-- Registro com data futura fica "programado" e não mexe em base_salary.
-- Registro retroativo também não mexe, se houver um mais recente já vigente.

CREATE OR REPLACE FUNCTION public.fn_sync_employee_current_salary(p_employee_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_current NUMERIC;
    v_hourly  NUMERIC;
    v_daily   NUMERIC;
BEGIN
    SELECT h.new_salary INTO v_current
      FROM public.employee_salary_history h
     WHERE h.employee_id = p_employee_id
       AND h.effective_date <= CURRENT_DATE
     ORDER BY h.effective_date DESC, h.created_at DESC
     LIMIT 1;

    -- Sem nenhum registro vigente (ex.: apagaram tudo, ou só há data futura):
    -- não zera o salário do colaborador — apenas não há o que sincronizar.
    IF v_current IS NULL THEN
        RETURN NULL;
    END IF;

    -- Mesma fórmula da aba Geral do formulário (LaborEmployeeForm.tsx):
    -- hora = salário / 220 ; dia = hora * 8
    v_hourly := ROUND(v_current / 220.0, 2);
    v_daily  := ROUND(v_hourly * 8, 2);

    -- Impede que o trigger de captura grave uma linha duplicada por causa
    -- deste UPDATE. É a razão de a escrita passar por RPC e não por PostgREST.
    PERFORM set_config('app.skip_salary_history', 'on', true);

    UPDATE public.employees
       SET base_salary = v_current,
           hourly_cost = v_hourly,
           daily_cost  = v_daily
     WHERE id = p_employee_id;

    PERFORM set_config('app.skip_salary_history', 'off', true);

    RETURN v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_employee_current_salary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sync_employee_current_salary(UUID) TO authenticated;

-- ─── 1b. Registrar um reajuste (a mão dupla, atômica) ───────────────────────
-- SECURITY INVOKER: a RLS de employee_salary_history e employees vale para o
-- chamador — quem não é membro da org não grava.

CREATE OR REPLACE FUNCTION public.fn_register_salary_change(
    p_employee_id    UUID,
    p_effective_date DATE,
    p_new_salary     NUMERIC,
    p_change_type    TEXT DEFAULT 'OUTRO',
    p_notes          TEXT DEFAULT NULL,
    p_file_url       TEXT DEFAULT NULL,
    p_file_name      TEXT DEFAULT NULL,
    p_org_role_id    UUID DEFAULT NULL,
    p_role_label     TEXT DEFAULT NULL,
    p_jornada        NUMERIC DEFAULT NULL,
    p_contract_type  TEXT DEFAULT NULL
)
RETURNS public.employee_salary_history   -- tipo da tabela, não RETURNS TABLE
LANGUAGE plpgsql                          -- (RETURNS TABLE cria variáveis OUT
SECURITY INVOKER                          --  homônimas e derruba com 42702)
SET search_path = public
AS $$
DECLARE
    v_emp     public.employees%ROWTYPE;
    v_record  public.employee_salary_history%ROWTYPE;
BEGIN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaborador % não encontrado.', p_employee_id;
    END IF;

    INSERT INTO public.employee_salary_history (
        employee_id, org_id, effective_date, previous_salary, new_salary,
        change_type, org_role_id, role_label, jornada_horas_semana, contract_type,
        file_url, file_name, notes, source, created_by
    ) VALUES (
        p_employee_id,
        v_emp.org_id,
        p_effective_date,
        v_emp.base_salary,
        p_new_salary,
        COALESCE(p_change_type, 'OUTRO'),
        COALESCE(p_org_role_id, v_emp.role_id),
        COALESCE(p_role_label, v_emp.role),
        COALESCE(p_jornada, v_emp.jornada_horas_semana),
        COALESCE(p_contract_type, v_emp.contract_type),
        p_file_url,
        p_file_name,
        p_notes,
        'MANUAL',
        auth.uid()
    )
    RETURNING * INTO v_record;

    PERFORM public.fn_sync_employee_current_salary(p_employee_id);

    RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_register_salary_change(
    UUID, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_register_salary_change(
    UUID, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ─── 1d. Captura automática ─────────────────────────────────────────────────
-- Pega TODOS os caminhos de escrita de base_salary: aba Geral do formulário,
-- contratação pelo ATS, import, SQL manual. Sem isso, só a aba teria trilha.

CREATE OR REPLACE FUNCTION public.fn_log_employee_salary_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- fn_sync_employee_current_salary já gravou a linha; este UPDATE é o eco dela.
    IF COALESCE(current_setting('app.skip_salary_history', true), 'off') = 'on' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.base_salary, 0) > 0 THEN
            INSERT INTO public.employee_salary_history (
                employee_id, org_id, effective_date, previous_salary, new_salary,
                change_type, org_role_id, role_label, jornada_horas_semana,
                contract_type, source, created_by
            ) VALUES (
                NEW.id, NEW.org_id, COALESCE(NEW.hire_date, CURRENT_DATE),
                NULL, NEW.base_salary, 'ADMISSAO', NEW.role_id, NEW.role,
                NEW.jornada_horas_semana, NEW.contract_type, 'AUTO', auth.uid()
            );
        END IF;
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.base_salary, 0) IS DISTINCT FROM COALESCE(OLD.base_salary, 0) THEN
        INSERT INTO public.employee_salary_history (
            employee_id, org_id, effective_date, previous_salary, new_salary,
            change_type, org_role_id, role_label, jornada_horas_semana,
            contract_type, source, created_by
        ) VALUES (
            NEW.id, NEW.org_id, CURRENT_DATE,
            OLD.base_salary, NEW.base_salary, 'AJUSTE', NEW.role_id, NEW.role,
            NEW.jornada_horas_semana, NEW.contract_type, 'AUTO', auth.uid()
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_salary_history ON public.employees;
CREATE TRIGGER trg_employees_salary_history
    AFTER INSERT OR UPDATE OF base_salary ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.fn_log_employee_salary_change();

-- ─── 1e. Backfill ───────────────────────────────────────────────────────────
-- Sem isso, todo colaborador que já existe abre a aba vazia e o KPI de variação
-- acumulada nasce sem base. Uma linha ADMISSAO por colaborador com salário.

INSERT INTO public.employee_salary_history (
    employee_id, org_id, effective_date, previous_salary, new_salary,
    change_type, org_role_id, role_label, jornada_horas_semana,
    contract_type, source, notes
)
SELECT e.id, e.org_id, COALESCE(e.hire_date, e.created_at::date, CURRENT_DATE),
       NULL, e.base_salary, 'ADMISSAO', e.role_id, e.role,
       e.jornada_horas_semana, e.contract_type, 'AUTO',
       'Registro inicial gerado na implantação do Histórico Salarial.'
  FROM public.employees e
 WHERE COALESCE(e.base_salary, 0) > 0
   AND NOT EXISTS (
        SELECT 1 FROM public.employee_salary_history h WHERE h.employee_id = e.id
   );

-- ============================================================================
-- Verificação (rodar depois de aplicar)
-- ============================================================================
-- 1) Backfill bateu:
--    SELECT (SELECT count(*) FROM employee_salary_history WHERE change_type='ADMISSAO') AS hist,
--           (SELECT count(*) FROM employees WHERE COALESCE(base_salary,0) > 0)          AS emp;
-- 2) Policy na camada certa:
--    SELECT policyname, roles, cmd FROM pg_policies
--     WHERE tablename = 'employee_salary_history';
-- 3) Trigger ativo:
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.employees'::regclass
--      AND tgname = 'trg_employees_salary_history';
-- ============================================================================
