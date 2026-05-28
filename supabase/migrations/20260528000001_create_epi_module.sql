-- ============================================================
-- Sprint 2: Módulo de EPIs
-- Tabelas: epi_catalog, epi_deliveries
-- ============================================================

-- 1. CATÁLOGO DE EPIs
CREATE TABLE IF NOT EXISTS public.epi_catalog (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    descricao       TEXT,
    ca              TEXT,          -- Certificado de Aprovação (MTE)
    ca_validade     DATE,          -- Validade do CA
    unidade         TEXT NOT NULL DEFAULT 'un',
    estoque_atual   INTEGER NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
    estoque_minimo  INTEGER NOT NULL DEFAULT 0,
    custo_unitario  NUMERIC(10,2) DEFAULT 0,
    fornecedor      TEXT,
    categoria       TEXT NOT NULL DEFAULT 'PROTECAO_CABECA'
        CHECK (categoria IN (
            'PROTECAO_CABECA',
            'PROTECAO_OLHOS_FACE',
            'PROTECAO_AUDITIVA',
            'PROTECAO_RESPIRATORIA',
            'PROTECAO_TRONCO',
            'PROTECAO_MEMBROS_SUPERIORES',
            'PROTECAO_MEMBROS_INFERIORES',
            'PROTECAO_QUEDAS',
            'OUTROS'
        )),
    status          TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','INATIVO')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epi_catalog_org ON public.epi_catalog(org_id);
CREATE INDEX IF NOT EXISTS idx_epi_catalog_status ON public.epi_catalog(org_id, status);
CREATE INDEX IF NOT EXISTS idx_epi_catalog_ca_validade ON public.epi_catalog(ca_validade) WHERE ca_validade IS NOT NULL;

-- 2. ENTREGAS DE EPIs (ficha digital por colaborador)
CREATE TABLE IF NOT EXISTS public.epi_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    epi_id          UUID NOT NULL REFERENCES public.epi_catalog(id) ON DELETE RESTRICT,
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name    TEXT,
    quantidade      INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    delivered_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    returned_at     DATE,
    motivo          TEXT,               -- Motivo da entrega (desgaste, perda, NR obrigatório...)
    assinatura_url  TEXT,               -- Foto/PNG da assinatura do colaborador
    is_returned     BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epi_deliveries_employee ON public.epi_deliveries(employee_id);
CREATE INDEX IF NOT EXISTS idx_epi_deliveries_epi ON public.epi_deliveries(epi_id);
CREATE INDEX IF NOT EXISTS idx_epi_deliveries_org ON public.epi_deliveries(org_id);
CREATE INDEX IF NOT EXISTS idx_epi_deliveries_date ON public.epi_deliveries(delivered_at);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.epi_catalog   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epi_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "epi_catalog_org_access" ON public.epi_catalog
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "epi_deliveries_org_access" ON public.epi_deliveries
    FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================

CREATE TRIGGER trg_epi_catalog_updated_at
    BEFORE UPDATE ON public.epi_catalog
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- FUNÇÃO: desconta estoque ao entregar, repõe ao devolver
-- ============================================================

CREATE OR REPLACE FUNCTION public.epi_update_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NOT NEW.is_returned THEN
        -- Nova entrega: desconta estoque
        UPDATE public.epi_catalog
        SET estoque_atual = estoque_atual - NEW.quantidade
        WHERE id = NEW.epi_id AND estoque_atual >= NEW.quantidade;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Estoque insuficiente para o EPI selecionado.';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.is_returned = TRUE AND OLD.is_returned = FALSE THEN
        -- Devolução: repõe estoque
        UPDATE public.epi_catalog
        SET estoque_atual = estoque_atual + NEW.quantidade
        WHERE id = NEW.epi_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_epi_stock_control
    AFTER INSERT OR UPDATE ON public.epi_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.epi_update_stock();
