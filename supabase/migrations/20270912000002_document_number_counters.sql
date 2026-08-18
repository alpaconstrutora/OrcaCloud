-- Contador atômico genérico de numeração de documento — substitui as 5
-- tabelas de escopo hardcoded (purchase_order_number_counters,
-- contract_number_counters, quotation_number_counters,
-- rental_contract_number_counters, unit_sale_contract_number_counters).
--
-- Onde antes cada tabela travava o escopo do sequencial na estrutura (project_id
-- ou unit_id), aqui o escopo é uma STRING (`scope_key`) montada pelo front a
-- partir dos códigos das variáveis presentes na máscara, na ordem em que
-- aparecem, separados por '|'. Isso é o que faz a decisão de produto
-- "o {seq} reinicia pela combinação de TODAS as variáveis escolhidas" ser
-- literal: mudar a máscara muda o escopo do contador.
--
-- Ex.: máscara com {empreendimento}+{fornecedor} → scope_key = 'RES01|FORN003'.
-- Máscara só com {prefixo} (nenhuma variável) → scope_key = '' (contador único
-- do tipo, na organização).
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.document_number_counters (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doc_type   TEXT NOT NULL,
    scope_key  TEXT NOT NULL,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (organization_id, doc_type, scope_key)
);

COMMENT ON TABLE public.document_number_counters IS
    'Sequencial atômico por (organização, tipo de documento, combinação de variáveis da máscara). Acesso exclusivo via fn_next_document_seq.';

-- RLS ligada e SEM policy de propósito: ninguém lê nem escreve direto — mesmo
-- desenho de purchase_order_number_counters (20270835000000). O único caminho
-- é a RPC abaixo (SECURITY DEFINER), que valida a organização do usuário.
ALTER TABLE public.document_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_next_document_seq(
    p_org_id UUID,
    p_doc_type TEXT,
    p_scope_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'Organização não informada.' USING ERRCODE = '22023';
    END IF;
    IF p_doc_type IS NULL OR p_doc_type = '' THEN
        RAISE EXCEPTION 'Tipo de documento não informado.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = p_org_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.document_number_counters
        (organization_id, doc_type, scope_key, last_seq, updated_at)
    VALUES (p_org_id, p_doc_type, COALESCE(p_scope_key, ''), 1, NOW())
    ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
        SET last_seq   = public.document_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$X$;

-- GRANT authenticated sozinho não tira o EXECUTE que o PUBLIC ganha por padrão.
REVOKE ALL ON FUNCTION public.fn_next_document_seq(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_document_seq(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_document_seq(UUID, TEXT, TEXT) TO authenticated;
