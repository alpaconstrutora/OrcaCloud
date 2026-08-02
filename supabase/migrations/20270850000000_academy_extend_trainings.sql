-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 1
-- Estende as tabelas EXISTENTES de treinamento.
--
-- Princípio: training_courses continua sendo A entidade Treinamento
-- (única, compartilhada por RH/SESMT/obra) e employee_trainings continua
-- sendo A fonte de "treinamento realizado". A Academia pendura conteúdo
-- versionado no curso e escreve de volta no registro legal ao concluir.
--
-- TODOS os defaults preservam o comportamento atual. Nenhuma migração de
-- dado é necessária: um curso sem conteúdo continua sendo PRESENCIAL e o
-- registro manual segue com origem = 'MANUAL'.
-- ============================================================

SET lock_timeout = '3s';

-- ── training_courses ────────────────────────────────────────────────────

ALTER TABLE public.training_courses
    -- Único flag que decide se a UI mostra "Montar conteúdo".
    ADD COLUMN IF NOT EXISTS modalidade TEXT NOT NULL DEFAULT 'PRESENCIAL',
    -- Resolvem o gap do roles_obrigatorios TEXT[] casado contra
    -- employees.role (texto livre). O array TEXT legado FICA e continua
    -- valendo — a resolução de atribuição faz OR das duas fontes.
    ADD COLUMN IF NOT EXISTS cargos_obrigatorios   UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS funcoes_obrigatorias  UUID[] NOT NULL DEFAULT '{}',
    -- PATH no bucket, NUNCA URL (PLANO_STORAGE_PRIVATIZACAO.md).
    ADD COLUMN IF NOT EXISTS capa_storage_path TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'training_courses_modalidade_chk'
          AND conrelid = 'public.training_courses'::regclass
    ) THEN
        ALTER TABLE public.training_courses
            ADD CONSTRAINT training_courses_modalidade_chk
            CHECK (modalidade IN ('PRESENCIAL','EAD','HIBRIDO'));
    END IF;
END $$;

-- ── employee_trainings — a ponte com a Academia ─────────────────────────

ALTER TABLE public.employee_trainings
    ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'MANUAL',
    -- Sem FK: academy_enrollments ainda não existe neste passo, e o
    -- padrão do módulo é resolver o join no cliente/RPC.
    ADD COLUMN IF NOT EXISTS enrollment_id          UUID,
    ADD COLUMN IF NOT EXISTS version_id             UUID,
    ADD COLUMN IF NOT EXISTS academy_certificate_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_trainings_origem_chk'
          AND conrelid = 'public.employee_trainings'::regclass
    ) THEN
        ALTER TABLE public.employee_trainings
            ADD CONSTRAINT employee_trainings_origem_chk
            CHECK (origem IN ('MANUAL','ACADEMIA'));
    END IF;
END $$;

-- Retry / duplo clique na conclusão não pode gerar dois registros legais
-- para a MESMA matrícula. (Presencial + EAD do mesmo curso continuam
-- podendo coexistir — são dois eventos reais, não duplicidade.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_training_enrollment
    ON public.employee_trainings(enrollment_id)
    WHERE enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emp_trainings_origem
    ON public.employee_trainings(org_id, origem);

COMMENT ON COLUMN public.training_courses.modalidade IS
    'PRESENCIAL (default, comportamento legado) | EAD | HIBRIDO. EAD/HIBRIDO liberam o construtor de conteúdo da Academia.';
COMMENT ON COLUMN public.employee_trainings.origem IS
    'MANUAL = registro digitado pelo RH (legado). ACADEMIA = gerado pela conclusão de uma matrícula EAD.';
COMMENT ON COLUMN public.employee_trainings.version_id IS
    'Versão do conteúdo sob a qual a pessoa foi aprovada. É isto que permite dizer "sua evidência é da v1, a vigente é a v3" sem apagar nada.';
