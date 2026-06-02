-- =============================================================================
-- Fase 0 — Convergência: services_contracts → contracts rico
-- =============================================================================
-- Contexto: services_opportunities.converted_contract_id aponta para
-- services_contracts (modelo fino). Esta migration adiciona rich_contract_id
-- apontando para contracts (modelo rico com medição, aditivo, retenção, sync
-- financeiro). Trigger atualizado para criar ambos na conversão 'won'.
-- =============================================================================

-- 1. Nova coluna em services_opportunities
ALTER TABLE public.services_opportunities
  ADD COLUMN IF NOT EXISTS rich_contract_id UUID
    REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_opp_rich_contract
  ON public.services_opportunities(rich_contract_id);

-- 2. Atualizar trigger de conversão para criar também contracts rico
CREATE OR REPLACE FUNCTION public.tg_services_convert_to_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_project_id     UUID;
    v_contract_id    UUID;       -- services_contracts (thin, backward compat)
    v_rich_id        UUID;       -- contracts (rico)
    v_contract_number TEXT;
    v_rich_number    TEXT;
    v_total          NUMERIC(15,2);
    v_proposal_id    UUID;
    v_end_date       DATE;
BEGIN
    -- Só age na transição para 'won'
    IF NEW.stage <> 'won' OR OLD.stage = 'won' THEN
        RETURN NEW;
    END IF;

    -- Idempotência: já convertido, ignora
    IF NEW.converted_contract_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Pega a última proposta enviada/aceita (se houver)
    SELECT id, total_value, valid_until INTO v_proposal_id, v_total, v_end_date
    FROM public.services_proposals
    WHERE opportunity_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_total IS NULL THEN
        v_total := COALESCE(NEW.estimated_value, 0);
    END IF;

    -- end_date: se a proposta tiver valid_until, usa; senão 1 ano a partir de hoje
    IF v_end_date IS NULL THEN
        v_end_date := CURRENT_DATE + INTERVAL '1 year';
    END IF;

    -- 1) Cria a obra (projects) se ainda não houver
    IF NEW.converted_project_id IS NULL THEN
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

    -- 2) Cria o contrato FINO (services_contracts) — backward compat
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

    -- 3) Cria o contrato RICO (contracts) — nova fonte de verdade
    v_rich_number := public.get_next_contract_number(NEW.organization_id::TEXT);

    INSERT INTO public.contracts (
        organization_id,
        project_id,
        number,
        title,
        contract_type,
        nature,
        start_date,
        end_date,
        status,
        original_value,
        current_value,
        retention_rate
    ) VALUES (
        NEW.organization_id,
        v_project_id,
        v_rich_number,
        COALESCE(NEW.contact_name, 'Contrato') || ' - ' || COALESCE(NEW.work_type, 'Serviço'),
        'Outros',
        'Serviço',
        CURRENT_DATE,
        v_end_date,
        'Ativo',
        v_total,
        v_total,
        0
    )
    RETURNING id INTO v_rich_id;

    NEW.rich_contract_id := v_rich_id;
    NEW.won_at := NOW();
    RETURN NEW;
END;
$$;

-- Recriar trigger (função substituída acima é suficiente, mas garantir)
DROP TRIGGER IF EXISTS trg_services_convert ON public.services_opportunities;
CREATE TRIGGER trg_services_convert
    BEFORE UPDATE OF stage ON public.services_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_convert_to_project();
