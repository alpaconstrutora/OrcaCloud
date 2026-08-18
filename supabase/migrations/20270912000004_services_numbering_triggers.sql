-- Migra os dois geradores de número do CRM de Serviços (propostas PROP- e
-- contratos CTR-, hoje `nextval('services_proposal_seq'/'services_contract_seq')`
-- + concatenação de ano fixo) para o motor de Nomenclatura configurável.
--
-- LIMITAÇÃO DE SCHEMA (documentada aqui de propósito, não é descuido): estes
-- dois documentos nascem de um TRIGGER (`tg_services_assign_proposal_number`
-- em INSERT de `services_proposals`, `tg_services_convert_to_project` na
-- transição de estágio para 'won'), não de uma tela que resolve os códigos
-- como orderNumberingService faz. `services_opportunities` guarda o cliente
-- como texto livre (`contact_name`), sem `client_id`, e não tem
-- `cost_center_id`. Por isso as variáveis CLIENTE e CENTRO_CUSTO NÃO estão
-- disponíveis para SERVICE_PROPOSAL/SERVICE_CRM_CONTRACT nesta primeira
-- versão — só ORGANIZAÇÃO. Oferecer essas variáveis na UI de Nomenclatura
-- para estes dois tipos seria a própria armadilha que a decisão de bloqueio
-- (2026-08-17) quis evitar: o usuário configuraria e travaria toda transição
-- de estágio do funil. O catálogo do front (services/documentNumbering/catalog.ts)
-- respeita essa mesma limitação.
--
-- Consequência aceita: o componente de ANO que existia no formato antigo
-- (`PROP-2026-00001`) some ao herdar o formato default da Nomenclatura, pois
-- "ano" não é uma das 7 variáveis pedidas. Documentos já emitidos mantêm o
-- número antigo (nenhuma renumeração).
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

-- ═══ Formatador puro — mesma regra de services/documentNumbering/format.ts ═══
CREATE OR REPLACE FUNCTION public.fn_format_document_number(
    p_slots JSONB,        -- array de tokens: 'EMPTY' | 'PREFIX' | nome da variável
    p_values JSONB,        -- { "TOKEN": "codigo" } para os tokens resolvidos
    p_prefix TEXT,
    p_separator TEXT,
    p_seq INTEGER,
    p_seq_padding SMALLINT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $X$
DECLARE
    v_token TEXT;
    v_parts TEXT[] := '{}';
    v_sep TEXT := COALESCE(NULLIF(p_separator, ''), '-');
BEGIN
    FOR v_token IN SELECT jsonb_array_elements_text(COALESCE(p_slots, '[]'::jsonb))
    LOOP
        IF v_token = 'EMPTY' THEN
            CONTINUE;
        ELSIF v_token = 'PREFIX' THEN
            IF COALESCE(p_prefix, '') <> '' THEN
                v_parts := v_parts || trim(both v_sep FROM p_prefix);
            END IF;
        ELSE
            IF COALESCE(p_values ->> v_token, '') <> '' THEN
                v_parts := v_parts || (p_values ->> v_token);
            END IF;
        END IF;
    END LOOP;

    v_parts := v_parts || LPAD(p_seq::TEXT, GREATEST(1, COALESCE(p_seq_padding, 4)), '0');

    RETURN array_to_string(v_parts, v_sep);
END;
$X$;

-- ═══ Orquestrador — lê configuração, valida variáveis, gera sequencial ═══
--
-- p_values só precisa trazer os tokens que o CHAMADOR consegue resolver. Se a
-- máscara configurada pedir um token ausente de p_values, a criação é
-- BLOQUEADA (RAISE EXCEPTION) — mesma regra de produto do resolveOrderCodes()
-- no front (MissingCodeError), aplicada aqui porque estes dois documentos
-- nascem de trigger, sem tela própria para mostrar o erro antes de tentar.
CREATE OR REPLACE FUNCTION public.fn_generate_document_number(
    p_org_id UUID,
    p_doc_type TEXT,
    p_values JSONB,
    p_default_slots JSONB,
    p_default_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_slots JSONB;
    v_prefix TEXT;
    v_separator TEXT;
    v_padding SMALLINT;
    v_token TEXT;
    v_scope_parts TEXT[] := '{}';
    v_seq INTEGER;
BEGIN
    SELECT slots, prefix, separator, seq_padding
      INTO v_slots, v_prefix, v_separator, v_padding
      FROM public.document_numbering_settings
     WHERE organization_id = p_org_id AND doc_type = p_doc_type;

    IF NOT FOUND THEN
        v_slots := p_default_slots;
        v_prefix := p_default_prefix;
        v_separator := '-';
        v_padding := 4;
    END IF;

    -- Bloqueio: cada variável presente na máscara precisa vir resolvida.
    FOR v_token IN SELECT jsonb_array_elements_text(v_slots)
    LOOP
        IF v_token NOT IN ('EMPTY', 'PREFIX') THEN
            IF COALESCE(p_values ->> v_token, '') = '' THEN
                RAISE EXCEPTION
                    'Não é possível gerar o número de % : a variável % não está disponível para este documento. Ajuste a máscara em Configurações do Sistema › Nomenclatura.',
                    p_doc_type, v_token
                    USING ERRCODE = '22023';
            END IF;
            v_scope_parts := v_scope_parts || (p_values ->> v_token);
        END IF;
    END LOOP;

    v_seq := public.fn_next_document_seq(p_org_id, p_doc_type, array_to_string(v_scope_parts, '|'));

    RETURN public.fn_format_document_number(v_slots, p_values, v_prefix, v_separator, v_seq, v_padding);
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_format_document_number(JSONB, JSONB, TEXT, TEXT, INTEGER, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_format_document_number(JSONB, JSONB, TEXT, TEXT, INTEGER, SMALLINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_format_document_number(JSONB, JSONB, TEXT, TEXT, INTEGER, SMALLINT) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_generate_document_number(UUID, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_generate_document_number(UUID, TEXT, JSONB, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_generate_document_number(UUID, TEXT, JSONB, JSONB, TEXT) TO authenticated;

-- ═══ Trigger de proposta — troca a sequence global pelo motor novo ═══
-- Mantém o guard "só gera se vier vazio" que já existia (não é novidade desta
-- migration) — front continua podendo mandar um número manual.
CREATE OR REPLACE FUNCTION public.tg_services_assign_proposal_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_org_code TEXT;
BEGIN
    IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
        SELECT code INTO v_org_code FROM public.organizations WHERE id = NEW.organization_id;

        NEW.proposal_number := public.fn_generate_document_number(
            NEW.organization_id,
            'SERVICE_PROPOSAL',
            jsonb_build_object('ORGANIZACAO', COALESCE(v_org_code, '')),
            '["PREFIX"]'::jsonb,
            'PROP'
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ═══ Trigger de conversão — idem para o contrato CTR- ═══
CREATE OR REPLACE FUNCTION public.tg_services_convert_to_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_project_id UUID;
    v_contract_id UUID;
    v_contract_number TEXT;
    v_total NUMERIC(15,2);
    v_proposal_id UUID;
    v_org_code TEXT;
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
    SELECT id, total_value INTO v_proposal_id, v_total
    FROM public.services_proposals
    WHERE opportunity_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_total IS NULL THEN
        v_total := COALESCE(NEW.estimated_value, 0);
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

    -- 2) Cria o contrato de venda — número pelo motor de Nomenclatura
    SELECT code INTO v_org_code FROM public.organizations WHERE id = NEW.organization_id;

    v_contract_number := public.fn_generate_document_number(
        NEW.organization_id,
        'SERVICE_CRM_CONTRACT',
        jsonb_build_object('ORGANIZACAO', COALESCE(v_org_code, '')),
        '["PREFIX"]'::jsonb,
        'CTR'
    );

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
