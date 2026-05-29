-- =============================================================================
-- Integração CRM Serviços ↔ Engenharia Orçamentos
-- =============================================================================
-- Adiciona vínculo opcional entre oportunidade comercial e projeto de
-- engenharia (classification='ORCAMENTO' em projects). Permite ao CRM:
--   1. Vincular orçamento existente da engenharia
--   2. Solicitar criação de novo orçamento (cria projeto vazio em ORCAMENTO)
--   3. Migrar do orçamento simples para o de engenharia
--
-- A oportunidade segue podendo usar `services_budgets` (orçamento simples).
-- O campo `budget_source` decide qual prevalece para a proposta.
-- =============================================================================

ALTER TABLE public.services_opportunities
    ADD COLUMN IF NOT EXISTS budget_source TEXT NOT NULL DEFAULT 'simple'
        CHECK (budget_source IN ('simple', 'engineering')),
    ADD COLUMN IF NOT EXISTS engineering_project_id UUID
        REFERENCES public.projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS engineering_request_status TEXT
        CHECK (engineering_request_status IN ('pending', 'in_progress', 'ready') OR engineering_request_status IS NULL);

CREATE INDEX IF NOT EXISTS idx_services_opp_engineering_project
    ON public.services_opportunities(engineering_project_id)
    WHERE engineering_project_id IS NOT NULL;

COMMENT ON COLUMN public.services_opportunities.budget_source IS
    'Fonte do orçamento: "simple" usa services_budgets (criado no CRM), "engineering" usa projects vinculado pelo orçamentista.';
COMMENT ON COLUMN public.services_opportunities.engineering_project_id IS
    'Projeto da engenharia (classification=ORCAMENTO) vinculado a esta oportunidade.';
COMMENT ON COLUMN public.services_opportunities.engineering_request_status IS
    'Status da solicitação ao setor de engenharia: pending (criada, aguardando), in_progress (orçamentista trabalhando), ready (concluído).';

-- ---------------------------------------------------------------------------
-- Atualiza trigger de conversão para reusar projeto da engenharia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_services_convert_to_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_project_id UUID;
    v_contract_id UUID;
    v_contract_number TEXT;
    v_total NUMERIC(15,2);
    v_proposal_id UUID;
    v_project_settings JSONB;
BEGIN
    IF NEW.stage <> 'won' OR OLD.stage = 'won' THEN
        RETURN NEW;
    END IF;

    IF NEW.converted_contract_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id, total_value INTO v_proposal_id, v_total
    FROM public.services_proposals
    WHERE opportunity_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_total IS NULL THEN
        v_total := COALESCE(NEW.estimated_value, 0);
    END IF;

    -- Caso engenharia + projeto vinculado: promove ORCAMENTO → OBRA
    IF NEW.budget_source = 'engineering' AND NEW.engineering_project_id IS NOT NULL THEN
        v_project_id := NEW.engineering_project_id;

        SELECT settings INTO v_project_settings
        FROM public.projects WHERE id = v_project_id;

        v_project_settings := COALESCE(v_project_settings, '{}'::jsonb)
            || jsonb_build_object('classification', 'OBRA');

        UPDATE public.projects
        SET settings = v_project_settings
        WHERE id = v_project_id;

        NEW.converted_project_id := v_project_id;

    -- Caso simples (ou sem vínculo): cria projeto novo como antes
    ELSIF NEW.converted_project_id IS NULL THEN
        INSERT INTO public.projects (organization_id, name, created_at)
        VALUES (
            NEW.organization_id,
            COALESCE(NEW.contact_name, 'Obra') || ' - ' || COALESCE(NEW.work_type, 'Serviço'),
            NOW()
        )
        RETURNING id INTO v_project_id;
        NEW.converted_project_id := v_project_id;
    ELSE
        v_project_id := NEW.converted_project_id;
    END IF;

    -- Cria contrato de venda
    v_contract_number := 'CTR-' || to_char(NOW(), 'YYYY')
        || '-' || lpad(nextval('services_contract_seq')::text, 5, '0');

    INSERT INTO public.services_contracts (
        organization_id, opportunity_id, project_id, proposal_id,
        contract_number, client_name, total_value, status, start_date
    ) VALUES (
        NEW.organization_id, NEW.id, v_project_id, v_proposal_id,
        v_contract_number, NEW.contact_name, v_total, 'active', CURRENT_DATE
    )
    RETURNING id INTO v_contract_id;

    NEW.converted_contract_id := v_contract_id;
    NEW.won_at := NOW();
    RETURN NEW;
END;
$$;
