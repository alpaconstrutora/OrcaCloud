-- ============================================================
-- Portal de Treinamentos — passo 1: identidade do treinando
-- Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
--
-- Pedido (15/10/2026): "recursos humanos > treinamento: criar portal para
-- treinamentos". Decisões: colaboradores + terceirizados, entrada por e-mail
-- e senha com convite, portal dedicado em /portal-treinamentos.
--
-- O que nasce aqui:
--   • academy_portal_users — quem pode entrar no portal (uma linha por
--     organização × e-mail). Colaborador aponta para a ficha existente;
--     TERCEIRO ganha uma ficha própria em employees (contract_type
--     'EMPREITEIRO', academy_externo = TRUE), porque toda a cadeia da
--     Academia — matrícula, progresso, certificado e o registro legal em
--     employee_trainings (FK) — é por colaborador.
--   • employees.academy_externo — marca a ficha criada só para treinamento.
--   • training_courses.inscricao_aberta / inscricao_prazo_dias — catálogo
--     com inscrição pelo próprio treinando.
--   • academy_enrollments.origem ganha 'INSCRICAO'.
--   • academy_portal_users_create — cria ficha (se terceiro) + acesso na
--     MESMA transação, para não sobrar ficha sem acesso.
--
-- REGRA #7: nenhuma policy com `true`; RPC com REVOKE de PUBLIC e anon e a
-- autorização (is_org_member) DENTRO da função SECURITY DEFINER.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1. Colunas novas nas tabelas existentes ────────────────────────────

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS academy_externo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.employees.academy_externo IS
    'TRUE = ficha criada pelo Portal de Treinamentos para um terceirizado/prestador. Não é quadro próprio: só existe para a Academia matricular, registrar e certificar.';

ALTER TABLE public.training_courses
    ADD COLUMN IF NOT EXISTS inscricao_aberta     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS inscricao_prazo_dias INTEGER;

COMMENT ON COLUMN public.training_courses.inscricao_aberta IS
    'TRUE = aparece no catálogo do Portal de Treinamentos e o treinando pode se inscrever sozinho (precisa de versão PUBLICADA).';
COMMENT ON COLUMN public.training_courses.inscricao_prazo_dias IS
    'Prazo (dias a partir da inscrição) da matrícula criada pelo catálogo. NULL = sem prazo.';

-- Origem 'INSCRICAO' = matrícula aberta pelo próprio treinando no catálogo.
ALTER TABLE public.academy_enrollments DROP CONSTRAINT IF EXISTS academy_enrollments_origem_check;
ALTER TABLE public.academy_enrollments
    ADD CONSTRAINT academy_enrollments_origem_check
    CHECK (origem IN ('ATRIBUICAO','MANUAL','AUTOMATICA','RECICLAGEM','INSCRICAO'));

-- ── 2. academy_portal_users ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_portal_users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email            TEXT NOT NULL,
    name             TEXT NOT NULL,
    phone            TEXT,
    cpf              TEXT,
    tipo             TEXT NOT NULL CHECK (tipo IN ('COLABORADOR','TERCEIRO')),
    -- sem FK: employees é tabela quente (deadlock 40P01 — ver 20270850000002)
    employee_id      UUID NOT NULL,
    empresa_terceira TEXT,
    contractor_id    UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    invited_at       TIMESTAMPTZ,
    last_access_at   TIMESTAMPTZ,
    created_by       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (org_id, email),
    UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_portal_users_email ON public.academy_portal_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_academy_portal_users_org   ON public.academy_portal_users(org_id, is_active);

COMMENT ON TABLE public.academy_portal_users IS
    'Acessos ao Portal de Treinamentos (/portal-treinamentos). O login é por e-mail e senha (convite pela Edge Function academy-portal-invite); a leitura do treinando é SÓ por RPC academy_portal_user_* — ele não é membro da organização.';

-- E-mail sempre minúsculo (o JWT compara letra a letra) + updated_at.
CREATE OR REPLACE FUNCTION public.academy_portal_users_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.academy_portal_users_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_academy_portal_users_touch ON public.academy_portal_users;
CREATE TRIGGER trg_academy_portal_users_touch
    BEFORE INSERT OR UPDATE ON public.academy_portal_users
    FOR EACH ROW EXECUTE FUNCTION public.academy_portal_users_touch();

-- RLS: só membro da organização dona (gestão no RH). O treinando NUNCA lê a
-- tabela direto — passa pelas RPCs do passo 2.
ALTER TABLE public.academy_portal_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academy_portal_users FROM anon;

DROP POLICY IF EXISTS academy_portal_users_select ON public.academy_portal_users;
CREATE POLICY academy_portal_users_select ON public.academy_portal_users
    FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS academy_portal_users_insert ON public.academy_portal_users;
CREATE POLICY academy_portal_users_insert ON public.academy_portal_users
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS academy_portal_users_update ON public.academy_portal_users;
CREATE POLICY academy_portal_users_update ON public.academy_portal_users
    FOR UPDATE TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS academy_portal_users_delete ON public.academy_portal_users;
CREATE POLICY academy_portal_users_delete ON public.academy_portal_users
    FOR DELETE TO authenticated USING (public.is_org_member(org_id));

-- ── 3. Criar acesso (ficha do terceiro + acesso numa transação) ─────────

CREATE OR REPLACE FUNCTION public.academy_portal_users_create(
    p_org              UUID,
    p_tipo             TEXT,
    p_name             TEXT,
    p_email            TEXT,
    p_phone            TEXT DEFAULT NULL,
    p_cpf              TEXT DEFAULT NULL,
    p_employee_id      UUID DEFAULT NULL,
    p_empresa_terceira TEXT DEFAULT NULL,
    p_contractor_id    UUID DEFAULT NULL,
    p_funcao           TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email TEXT := lower(trim(coalesce(p_email, '')));
    v_emp   UUID := p_employee_id;
    v_row   public.academy_portal_users%ROWTYPE;
BEGIN
    IF p_org IS NULL OR NOT public.is_org_member(p_org) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização' USING ERRCODE = '42501';
    END IF;
    IF v_email = '' OR position('@' IN v_email) = 0 THEN
        RAISE EXCEPTION 'E-mail inválido' USING ERRCODE = '22023';
    END IF;
    IF coalesce(trim(p_name), '') = '' THEN
        RAISE EXCEPTION 'Nome é obrigatório' USING ERRCODE = '22023';
    END IF;

    IF p_tipo = 'COLABORADOR' THEN
        IF v_emp IS NULL THEN
            RAISE EXCEPTION 'Escolha o colaborador' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_emp AND e.org_id = p_org) THEN
            RAISE EXCEPTION 'Colaborador não pertence a esta organização' USING ERRCODE = '42501';
        END IF;

    ELSIF p_tipo = 'TERCEIRO' THEN
        -- Ficha própria: é ela que a Academia matricula, registra e certifica.
        INSERT INTO public.employees (
            org_id, name, email, phone, cpf, role, contract_type, status,
            hire_date, base_salary, academy_externo, notes)
        VALUES (
            p_org, trim(p_name), v_email, p_phone, p_cpf,
            coalesce(nullif(trim(p_funcao), ''), 'Terceirizado'),
            'EMPREITEIRO', 'ATIVO', CURRENT_DATE, 0, TRUE,
            format('Terceirizado/prestador cadastrado pelo Portal de Treinamentos%s.',
                   CASE WHEN coalesce(p_empresa_terceira, '') <> '' THEN ' — ' || p_empresa_terceira ELSE '' END))
        RETURNING id INTO v_emp;
    ELSE
        RAISE EXCEPTION 'Tipo inválido: %', p_tipo USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.academy_portal_users (
        org_id, email, name, phone, cpf, tipo, employee_id,
        empresa_terceira, contractor_id, created_by)
    VALUES (
        p_org, v_email, trim(p_name), p_phone, p_cpf, p_tipo, v_emp,
        nullif(trim(coalesce(p_empresa_terceira, '')), ''), p_contractor_id,
        auth.jwt() ->> 'email')
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Já existe acesso para este e-mail ou colaborador nesta organização'
            USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.academy_portal_users_create(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_portal_users_create(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT)
    TO authenticated;
