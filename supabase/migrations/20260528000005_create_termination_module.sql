-- ============================================================
-- Sprint 6: Módulo de Desligamento
-- Tabela: termination_records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.termination_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

    -- Dados do desligamento
    termination_date    DATE NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN (
                            'DEMISSAO_SEM_JUSTA_CAUSA',
                            'DEMISSAO_COM_JUSTA_CAUSA',
                            'PEDIDO_DEMISSAO',
                            'ACORDO_MUTUO',
                            'TERMINO_CONTRATO',
                            'APOSENTADORIA',
                            'FALECIMENTO',
                            'OUTROS'
                        )),
    motivo              TEXT,
    aviso_previo_tipo   TEXT CHECK (aviso_previo_tipo IN ('TRABALHADO','INDENIZADO','DISPENSADO') OR aviso_previo_tipo IS NULL),
    aviso_previo_inicio DATE,
    aviso_previo_fim    DATE,

    -- Checklist de desligamento (itens marcados)
    checklist           JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Entrevista de desligamento
    entrevista_realizada    BOOLEAN NOT NULL DEFAULT FALSE,
    entrevista_motivo_real  TEXT,
    entrevista_pontos       TEXT,
    entrevista_recontrataria BOOLEAN,

    -- Referências para outros módulos
    payroll_run_id      UUID REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
    epis_devolvidos     BOOLEAN NOT NULL DEFAULT FALSE,
    acessos_bloqueados  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Responsável
    processed_by        TEXT,
    status              TEXT NOT NULL DEFAULT 'RASCUNHO'
                            CHECK (status IN ('RASCUNHO','CONCLUIDO')),

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (employee_id)  -- um colaborador tem no máximo um registro de desligamento
);

CREATE INDEX IF NOT EXISTS idx_termination_org      ON public.termination_records(org_id);
CREATE INDEX IF NOT EXISTS idx_termination_employee ON public.termination_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_termination_date     ON public.termination_records(termination_date);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.termination_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "termination_records_org_access" ON public.termination_records
    FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================

CREATE TRIGGER trg_termination_updated_at
    BEFORE UPDATE ON public.termination_records
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO: finalizar desligamento
-- Executada ao marcar status=CONCLUIDO:
--   1. Atualiza employee status → DESLIGADO
--   2. Devolve todos EPIs ativos do colaborador
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_termination()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CONCLUIDO' AND OLD.status <> 'CONCLUIDO' THEN

        -- 1. Desligar colaborador
        UPDATE public.employees
        SET
            status             = 'DESLIGADO',
            termination_date   = NEW.termination_date,
            termination_reason = NEW.tipo || COALESCE(' — ' || NEW.motivo, '')
        WHERE id = NEW.employee_id;

        -- 2. Devolver EPIs pendentes automaticamente
        UPDATE public.epi_deliveries
        SET
            is_returned  = TRUE,
            returned_at  = NEW.termination_date
        WHERE employee_id = NEW.employee_id
          AND is_returned  = FALSE;

        NEW.epis_devolvidos    := TRUE;
        NEW.acessos_bloqueados := TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_finalize_termination
    BEFORE UPDATE ON public.termination_records
    FOR EACH ROW EXECUTE FUNCTION public.finalize_termination();
