-- ============================================================
-- Migration: aplicar_20270918000025_org_roles_faixa_salarial_restrita.sql
-- Faixa salarial de cargo passa a ser visível só para admin da empresa
--
-- A DECISÃO
-- Levantamento de 2026-09-03: `org_roles` guarda `salario_minimo` e
-- `salario_maximo`, e a policy de SELECT é `check_user_belongs_to_company` —
-- SEM recorte de papel. Ou seja, qualquer colaborador da empresa lia a faixa
-- salarial de TODOS os cargos, inclusive os acima dele, em qualquer tela que
-- liste cargos (LaborCargos, LaborEmployeeForm, OpuraGovernanceModule).
--
-- Perguntado ao dono se faixa de cargo é aberta ou confidencial de RH:
-- **"Só RH"** (2026-09-03).
--
-- POR QUE MUDAR O SCHEMA, E NÃO SÓ A TELA
-- **A RLS do Postgres recorta LINHA, não COLUNA.** Enquanto as duas colunas
-- estiverem numa linha que o colaborador pode ler, esconder no frontend não
-- esconde de ninguém: o valor continua vindo no JSON do PostgREST, visível no
-- DevTools. Privilégio de coluna (`REVOKE SELECT (col)`) também não serve aqui,
-- porque admin e colaborador são o MESMO papel de banco (`authenticated`) — a
-- distinção mora na policy, não no papel.
--
-- Sobra o caminho canônico: coluna sensível vira LINHA em tabela própria, e aí
-- a RLS volta a poder fazer seu trabalho. É o mesmo movimento das
-- `*_org_shares` da correção do C1-05.
--
-- SOBRE "ADMIN" SER O RECORTE DE "RH"
-- Uso `check_user_is_admin_of_company`, que é o conceito de administração que
-- este schema já tem — é o mesmo predicado da policy de escrita que já existia
-- em `org_roles`, então quem podia EDITAR a faixa continua podendo VER. Se o
-- projeto vier a ter um papel de RH distinto de admin, o ajuste é trocar o
-- predicado desta policy, num lugar só.
-- ============================================================

-- ── 1. A tabela ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_role_salary_bands (
    role_id        UUID PRIMARY KEY REFERENCES public.org_roles(id) ON DELETE CASCADE,
    -- Redundante com org_roles.company_id de propósito: a policy precisa
    -- decidir sem fazer JOIN com a tabela que ela está protegendo.
    company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    salario_minimo NUMERIC,
    salario_maximo NUMERIC,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_role_salary_bands_company
    ON public.org_role_salary_bands (company_id);

ALTER TABLE public.org_role_salary_bands ENABLE ROW LEVEL SECURITY;

-- REGRA OBRIGATÓRIA #7, pergunta 1: uma perna só, sem OR. Ler e escrever exigem
-- a mesma coisa — ser admin da empresa dona do cargo.
DROP POLICY IF EXISTS org_role_salary_bands_admin ON public.org_role_salary_bands;
CREATE POLICY org_role_salary_bands_admin ON public.org_role_salary_bands
    FOR ALL TO authenticated
    USING (public.check_user_is_admin_of_company(company_id))
    WITH CHECK (public.check_user_is_admin_of_company(company_id));

-- ── 2. Mover o dado ─────────────────────────────────────────────────────────
INSERT INTO public.org_role_salary_bands (role_id, company_id, salario_minimo, salario_maximo)
SELECT r.id, r.company_id, r.salario_minimo, r.salario_maximo
  FROM public.org_roles r
 WHERE r.salario_minimo IS NOT NULL OR r.salario_maximo IS NOT NULL
ON CONFLICT (role_id) DO UPDATE
   SET salario_minimo = EXCLUDED.salario_minimo,
       salario_maximo = EXCLUDED.salario_maximo;

-- ── 3. Só então tirar as colunas da origem ──────────────────────────────────
-- A ordem importa: conferir a cópia ANTES de apagar. DROP COLUMN não volta atrás.
DO $$
DECLARE
    v_origem  int;
    v_destino int;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='org_roles'
                  AND column_name='salario_minimo') THEN

        SELECT count(*) INTO v_origem FROM public.org_roles
         WHERE salario_minimo IS NOT NULL OR salario_maximo IS NOT NULL;
        SELECT count(*) INTO v_destino FROM public.org_role_salary_bands
         WHERE salario_minimo IS NOT NULL OR salario_maximo IS NOT NULL;

        IF v_destino < v_origem THEN
            RAISE EXCEPTION 'ABORTADO: % faixas na origem, % copiadas — nao apago a coluna',
                v_origem, v_destino;
        END IF;

        ALTER TABLE public.org_roles DROP COLUMN salario_minimo;
        ALTER TABLE public.org_roles DROP COLUMN salario_maximo;
        RAISE NOTICE 'org_roles: colunas de faixa removidas apos copiar % linha(s)', v_destino;
    ELSE
        RAISE NOTICE 'org_roles ja estava sem as colunas de faixa (migration reaplicada)';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_labor_updated_at') THEN
        DROP TRIGGER IF EXISTS trg_org_role_salary_bands_updated_at ON public.org_role_salary_bands;
        CREATE TRIGGER trg_org_role_salary_bands_updated_at
            BEFORE UPDATE ON public.org_role_salary_bands
            FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();
    END IF;
END $$;

-- ── 4. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_sobrou int;
    v_frouxa int;
    v_bandas int;
BEGIN
    SELECT count(*) INTO v_sobrou FROM information_schema.columns
     WHERE table_schema='public' AND table_name='org_roles'
       AND column_name IN ('salario_minimo','salario_maximo');
    IF v_sobrou > 0 THEN
        RAISE EXCEPTION 'org_roles ainda tem % coluna(s) de faixa salarial', v_sobrou;
    END IF;

    SELECT count(*) INTO v_frouxa FROM pg_policies
     WHERE schemaname='public' AND tablename='org_role_salary_bands'
       AND (qual='true' OR with_check='true');
    IF v_frouxa > 0 THEN
        RAISE EXCEPTION 'org_role_salary_bands com % policy sem condicao', v_frouxa;
    END IF;

    SELECT count(*) INTO v_bandas FROM public.org_role_salary_bands;
    RAISE NOTICE 'OK: % faixa(s) movida(s) para tabela restrita a admin da empresa.', v_bandas;
END $$;
