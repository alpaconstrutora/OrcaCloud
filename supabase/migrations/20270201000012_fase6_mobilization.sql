-- Migration: Fase 6.3 — Ordem de Início & Pré-mobilização
-- Contrato Matriz Cl.4, Manual Interno §11 — PLANO_MODULO_CONTRATOS_GAPS.md

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS start_order_issued_at      DATE,   -- data de emissão da Ordem de Início
    ADD COLUMN IF NOT EXISTS start_order_authorized_by   TEXT,   -- gestor autorizado que emitiu
    ADD COLUMN IF NOT EXISTS subcontracting_rule         TEXT    -- regra de subcontratação (CP-03)
        CHECK (subcontracting_rule IS NULL OR subcontracting_rule IN ('PROIBIDA', 'AUTORIZACAO_PREVIA', 'LISTA'));

-- Checklist de pré-mobilização (Manual §11): pacote assinado, ART/RRT, SST,
-- seguros/garantias, cronograma, materiais/logística, cadastro, integração/acesso.
CREATE TABLE IF NOT EXISTS public.contract_precedent_conditions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id     UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    item            TEXT NOT NULL,             -- Pacote assinado, ART/RRT/TRT, SST e equipe, Seguros/garantias, ...
    responsible     TEXT,                      -- papel responsável (Manual §11: Jurídico/Suprimentos/Engenharia/SST/Financeiro/Gestor/Administrativo)
    required        BOOLEAN NOT NULL DEFAULT true,
    satisfied       BOOLEAN NOT NULL DEFAULT false,
    satisfied_at    TIMESTAMPTZ,
    evidence_url    TEXT,
    notes           TEXT,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_precedent_conditions_contract ON public.contract_precedent_conditions (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_precedent_conditions_org      ON public.contract_precedent_conditions (organization_id);

ALTER TABLE public.contract_precedent_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_contract_precedent_conditions" ON public.contract_precedent_conditions;
CREATE POLICY "org_access_contract_precedent_conditions" ON public.contract_precedent_conditions
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS trg_contract_precedent_conditions_updated_at ON public.contract_precedent_conditions;
CREATE TRIGGER trg_contract_precedent_conditions_updated_at
    BEFORE UPDATE ON public.contract_precedent_conditions
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Semeia o checklist-padrão do Manual §11 ao criar um contrato (via trigger),
-- para o usuário não precisar montar a lista manualmente a cada contrato novo.
CREATE OR REPLACE FUNCTION public.fn_seed_contract_precedent_conditions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.contract_precedent_conditions
        (organization_id, contract_id, item, responsible, sort_order)
    VALUES
        (NEW.organization_id, NEW.id, 'Pacote assinado (Condições + Anexos)', 'Jurídico/Suprimentos', 1),
        (NEW.organization_id, NEW.id, 'ART/RRT/TRT', 'Engenharia', 2),
        (NEW.organization_id, NEW.id, 'SST e equipe', 'SST', 3),
        (NEW.organization_id, NEW.id, 'Seguros/garantias', 'Financeiro/Jurídico', 4),
        (NEW.organization_id, NEW.id, 'Cronograma e plano', 'Gestor', 5),
        (NEW.organization_id, NEW.id, 'Materiais e logística', 'Obra', 6),
        (NEW.organization_id, NEW.id, 'Cadastro no ÒPURA', 'Administrativo', 7),
        (NEW.organization_id, NEW.id, 'Integração e acesso', 'SST/Portaria', 8);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_contract_precedent_conditions ON public.contracts;
CREATE TRIGGER trg_seed_contract_precedent_conditions
    AFTER INSERT ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_seed_contract_precedent_conditions();

-- Backfill: contratos já existentes (criados antes desta migration) que ainda
-- não estão Encerrado/Cancelado ganham o checklist-padrão retroativamente.
INSERT INTO public.contract_precedent_conditions
    (organization_id, contract_id, item, responsible, sort_order)
SELECT c.organization_id, c.id, item, responsible, sort_order
FROM public.contracts c
CROSS JOIN (VALUES
    ('Pacote assinado (Condições + Anexos)', 'Jurídico/Suprimentos', 1),
    ('ART/RRT/TRT', 'Engenharia', 2),
    ('SST e equipe', 'SST', 3),
    ('Seguros/garantias', 'Financeiro/Jurídico', 4),
    ('Cronograma e plano', 'Gestor', 5),
    ('Materiais e logística', 'Obra', 6),
    ('Cadastro no ÒPURA', 'Administrativo', 7),
    ('Integração e acesso', 'SST/Portaria', 8)
) AS seed(item, responsible, sort_order)
WHERE c.status NOT IN ('Encerrado', 'Cancelado')
  AND c.organization_id IS NOT NULL  -- contratos órfãos (sem organização) ficam de fora
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_precedent_conditions p WHERE p.contract_id = c.id
  );
