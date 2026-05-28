-- ============================================================
-- Sprint 1: Expandir Cadastro de Colaboradores
-- Novos campos: matrícula, CNH, dados bancários, estrutura org.
-- ============================================================

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS matricula          TEXT,
    ADD COLUMN IF NOT EXISTS departamento       TEXT,
    ADD COLUMN IF NOT EXISTS centro_custo       TEXT,
    ADD COLUMN IF NOT EXISTS sindicato          TEXT,
    ADD COLUMN IF NOT EXISTS jornada_horas_semana NUMERIC(4,1) DEFAULT 44,
    -- CNH
    ADD COLUMN IF NOT EXISTS cnh_numero         TEXT,
    ADD COLUMN IF NOT EXISTS cnh_categoria      TEXT CHECK (cnh_categoria IN ('A','B','C','D','E','AB','AC','AD','AE') OR cnh_categoria IS NULL),
    ADD COLUMN IF NOT EXISTS cnh_validade       DATE,
    -- Dependentes
    ADD COLUMN IF NOT EXISTS num_dependentes    INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dependentes        JSONB DEFAULT '[]'::jsonb,
    -- Dados bancários
    ADD COLUMN IF NOT EXISTS banco_codigo       TEXT,
    ADD COLUMN IF NOT EXISTS banco_nome         TEXT,
    ADD COLUMN IF NOT EXISTS banco_agencia      TEXT,
    ADD COLUMN IF NOT EXISTS banco_conta        TEXT,
    ADD COLUMN IF NOT EXISTS banco_conta_tipo   TEXT DEFAULT 'corrente' CHECK (banco_conta_tipo IN ('corrente','poupanca') OR banco_conta_tipo IS NULL),
    ADD COLUMN IF NOT EXISTS banco_pix          TEXT,
    -- Tipo de funcionário expandido
    ADD COLUMN IF NOT EXISTS contract_type_extra TEXT; -- TEMPORARIO, APRENDIZ extras

-- Índice para matrícula dentro da organização
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_matricula_org
    ON public.employees(org_id, matricula)
    WHERE matricula IS NOT NULL AND matricula <> '';

-- Índice para centro de custo
CREATE INDEX IF NOT EXISTS idx_employees_centro_custo
    ON public.employees(org_id, centro_custo)
    WHERE centro_custo IS NOT NULL;

-- Expandir tipos de contrato (novos valores via CHECK não podem ser adicionados ao constraint existente, então anotamos no tipo)
-- Os novos tipos TEMPORARIO e APRENDIZ serão gerenciados via contract_type_extra
-- para manter backward compatibility com o CHECK constraint existente.
COMMENT ON COLUMN public.employees.contract_type_extra IS 'Tipos extras: TEMPORARIO, APRENDIZ. Use em conjunto com contract_type=PJ ou CLT.';
