-- ============================================================
-- Sprint 12: Portal do Colaborador
-- Tabela: portal_tokens (autenticação self-service por CPF/matrícula)
-- ============================================================

-- Tokens de acesso para o portal (sem precisar de conta Supabase)
CREATE TABLE IF NOT EXISTS public.portal_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    last_used_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (employee_id)     -- um token por colaborador (upsert)
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_employee ON public.portal_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token    ON public.portal_tokens(token) WHERE is_active = TRUE;

ALTER TABLE public.portal_tokens ENABLE ROW LEVEL SECURITY;

-- Gestor pode gerenciar tokens
CREATE POLICY "portal_tokens_org_access" ON public.portal_tokens
    FOR ALL USING (public.is_org_member(org_id));

-- Leitura pública do token (necessário para o colaborador autenticar sem login)
CREATE POLICY "portal_tokens_public_select" ON public.portal_tokens
    FOR SELECT USING (is_active = TRUE AND expires_at > NOW());

-- ============================================================
-- FUNÇÃO RPC: validar token do portal e retornar dados do colaborador
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_validate_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_tok   public.portal_tokens;
    v_emp   public.employees;
BEGIN
    SELECT * INTO v_tok
    FROM public.portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Token inválido ou expirado');
    END IF;

    SELECT * INTO v_emp FROM public.employees WHERE id = v_tok.employee_id;

    -- Atualizar last_used_at
    UPDATE public.portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN json_build_object(
        'valid',        TRUE,
        'employee_id',  v_emp.id,
        'org_id',       v_emp.org_id,
        'name',         v_emp.name,
        'role',         v_emp.role,
        'status',       v_emp.status,
        'avatar_url',   v_emp.avatar_url
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.portal_validate_token(TEXT) TO anon, authenticated;

-- ============================================================
-- FUNÇÃO RPC: gerar / renovar token para colaborador
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_generate_token(
    p_employee_id UUID,
    p_org_id      UUID
)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
BEGIN
    v_token := gen_random_uuid()::text;

    INSERT INTO public.portal_tokens (org_id, employee_id, token)
    VALUES (p_org_id, p_employee_id, v_token)
    ON CONFLICT (employee_id)
    DO UPDATE SET token = v_token, expires_at = NOW() + INTERVAL '30 days',
                  is_active = TRUE, last_used_at = NULL;

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.portal_generate_token(UUID, UUID) TO authenticated;

-- ============================================================
-- FUNÇÃO RPC: dados completos do portal para um colaborador
-- (holerites recentes, saldo férias, treinamentos vencendo, pontos pendentes)
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_employee_summary(p_employee_id UUID)
RETURNS JSON AS $$
DECLARE
    v_emp           public.employees;
    v_ferias_saldo  INTEGER := 0;
    v_pontos_pend   INTEGER := 0;
    v_trein_venc    INTEGER := 0;
    v_ausencias_mes INTEGER := 0;
BEGIN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Colaborador não encontrado');
    END IF;

    -- Saldo de férias disponível
    SELECT COALESCE(SUM(dias_restantes), 0) INTO v_ferias_saldo
    FROM public.vacation_balance WHERE employee_id = p_employee_id AND dias_restantes > 0;

    -- Pontos pendentes de aprovação
    SELECT COUNT(*) INTO v_pontos_pend
    FROM public.time_entries
    WHERE employee_id = p_employee_id AND status = 'PENDENTE';

    -- Treinamentos vencendo em 30 dias
    SELECT COUNT(*) INTO v_trein_venc
    FROM public.employee_trainings
    WHERE employee_id = p_employee_id
      AND data_validade IS NOT NULL
      AND data_validade <= CURRENT_DATE + 30
      AND status = 'ATIVO';

    -- Ausências no mês corrente
    SELECT COUNT(*) INTO v_ausencias_mes
    FROM public.absences
    WHERE employee_id = p_employee_id
      AND status = 'APROVADO'
      AND EXTRACT(MONTH FROM data_inicio) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM data_inicio)  = EXTRACT(YEAR FROM CURRENT_DATE);

    RETURN json_build_object(
        'employee', json_build_object(
            'id', v_emp.id, 'name', v_emp.name, 'role', v_emp.role,
            'status', v_emp.status, 'hire_date', v_emp.hire_date,
            'avatar_url', v_emp.avatar_url, 'matricula', v_emp.matricula
        ),
        'ferias_saldo',    v_ferias_saldo,
        'pontos_pendentes',v_pontos_pend,
        'treinamentos_vencendo', v_trein_venc,
        'ausencias_mes',   v_ausencias_mes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.portal_employee_summary(UUID) TO anon, authenticated;
