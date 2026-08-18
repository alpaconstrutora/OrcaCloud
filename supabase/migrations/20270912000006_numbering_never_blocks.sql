-- Reverte a política de bloqueio da Nomenclatura (decisão original de
-- 2026-08-17, revista em 2026-08-18 após travar contratos reais em produção:
-- "nada tem que ser exigido!"). `fn_generate_document_number` parava a
-- transição de estágio inteira do CRM de Serviços com RAISE EXCEPTION quando
-- a variável configurada não tinha valor disponível (ex.: organização sem
-- código cadastrado). Agora, o que não puder ser resolvido some do número —
-- nunca impede o documento de ser criado. Espelha a mesma mudança em
-- services/documentNumbering/resolvers.ts (front).
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

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

    -- NUNCA bloqueia: variável sem valor disponível em p_values simplesmente
    -- não entra no scope_key nem no número formatado (fn_format_document_number
    -- já descarta token sem valor, igual trata EMPTY).
    FOR v_token IN SELECT jsonb_array_elements_text(v_slots)
    LOOP
        IF v_token NOT IN ('EMPTY', 'PREFIX') AND COALESCE(p_values ->> v_token, '') <> '' THEN
            v_scope_parts := v_scope_parts || (p_values ->> v_token);
        END IF;
    END LOOP;

    v_seq := public.fn_next_document_seq(p_org_id, p_doc_type, array_to_string(v_scope_parts, '|'));

    RETURN public.fn_format_document_number(v_slots, p_values, v_prefix, v_separator, v_seq, v_padding);
END;
$X$;
