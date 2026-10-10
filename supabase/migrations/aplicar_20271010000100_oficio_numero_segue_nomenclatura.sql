-- ============================================================================
-- Documentos › Ofícios — F3: o número do ofício segue os dígitos e o separador
-- da página de Nomenclatura (10/10/2026)
--
-- Achado na conferência no app da F3: a tela Configurações › Nomenclatura
-- mostrava OF-ENG-0001/2026 (4 dígitos — "Dígitos do Sequencial" vale para a
-- página inteira) e a emissão deu OF-PWT-001/2026 (3 — o padrão do catálogo),
-- porque a organização ainda não tinha salvo a linha Ofícios. Agora, sem linha
-- salva, a emissão usa o separador e os dígitos da organização; o catálogo só
-- vale para organização que nunca salvou a Nomenclatura.
--
-- Reescrita a partir do ARQUIVO aplicar_20271008000200 (não do banco); só o
-- bloco do padrão muda.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.doc_gen_emitir(p_documento_id UUID, p_values JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_doc       public.doc_gen_documentos%ROWTYPE;
    v_slots     JSONB;
    v_prefix    TEXT;
    v_separator TEXT;
    v_padding   SMALLINT;
    v_year_suf  BOOLEAN;
    v_values    JSONB;
    v_sigla     TEXT;
    v_org_code  TEXT;
    v_data      DATE;
    v_ano       INTEGER;
    v_token     TEXT;
    v_parts     TEXT[] := '{}';
    v_scope     TEXT;
    v_seq       INTEGER;
    v_numero    TEXT;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Autorização AQUI DENTRO (REGRA #7): membro da organização do documento.
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_doc.organization_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    -- Idempotente: segundo clique devolve o mesmo número.
    IF v_doc.status = 'EMITIDO' THEN
        RETURN v_doc.numero;
    END IF;
    IF v_doc.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'Só rascunho pode ser emitido.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_doc.assunto), '') = '' OR v_doc.destinatario_snapshot IS NULL THEN
        RAISE EXCEPTION 'Documento sem assunto ou sem destinatário — não pode ser emitido.' USING ERRCODE = '22023';
    END IF;

    -- Máscara da organização, ou o padrão do catálogo (services/documentNumbering/catalog.ts — OFICIO).
    SELECT slots, prefix, separator, seq_padding, year_suffix
      INTO v_slots, v_prefix, v_separator, v_padding, v_year_suf
      FROM public.document_numbering_settings
     WHERE organization_id = v_doc.organization_id AND doc_type = 'OFICIO';
    IF NOT FOUND THEN
        v_slots := '["PREFIX", "DEPARTAMENTO"]'::jsonb;
        v_prefix := 'OF';
        v_year_suf := true;
        -- Separador e dígitos valem para a PÁGINA inteira de Nomenclatura (decisão de
        -- 2026-08-30): sem linha salva do Ofício, seguem os da organização — senão a
        -- tela mostraria OF-ENG-0001/2026 e a emissão daria OF-ENG-001/2026.
        SELECT separator, seq_padding INTO v_separator, v_padding
          FROM public.document_numbering_settings
         WHERE organization_id = v_doc.organization_id
         ORDER BY updated_at DESC
         LIMIT 1;
        v_separator := COALESCE(v_separator, '-');
        v_padding := COALESCE(v_padding, 3);
    END IF;

    -- Códigos que o banco resolve sozinho; o resto vem do cliente (só entra no texto do número).
    v_values := COALESCE(p_values, '{}'::jsonb) - 'DEPARTAMENTO' - 'ORGANIZACAO';
    IF v_doc.department_id IS NOT NULL THEN
        SELECT NULLIF(btrim(sigla), '') INTO v_sigla FROM public.company_departments WHERE id = v_doc.department_id;
        IF v_sigla IS NOT NULL THEN v_values := v_values || jsonb_build_object('DEPARTAMENTO', upper(v_sigla)); END IF;
    END IF;
    SELECT NULLIF(btrim(code), '') INTO v_org_code FROM public.organizations WHERE id = v_doc.organization_id;
    IF v_org_code IS NOT NULL THEN v_values := v_values || jsonb_build_object('ORGANIZACAO', v_org_code); END IF;

    -- Data automática = a da emissão (fuso de Brasília).
    v_data := COALESCE(v_doc.data_documento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    v_ano := EXTRACT(YEAR FROM v_data)::INTEGER;

    -- Escopo do contador = combinação das variáveis da máscara (+ o ano, se reinicia por ano).
    FOR v_token IN SELECT jsonb_array_elements_text(v_slots)
    LOOP
        IF v_token NOT IN ('EMPTY', 'PREFIX') AND COALESCE(v_values ->> v_token, '') <> '' THEN
            v_parts := v_parts || (v_values ->> v_token);
        END IF;
    END LOOP;
    IF v_year_suf THEN v_parts := v_parts || v_ano::TEXT; END IF;
    v_scope := array_to_string(v_parts, '|');

    v_seq := public.fn_next_document_seq(v_doc.organization_id, 'OFICIO', v_scope);
    v_numero := public.fn_format_document_number(v_slots, v_values, v_prefix, v_separator, v_seq, v_padding, v_year_suf, v_ano);

    PERFORM set_config('docgen.emitindo', 'on', true);
    UPDATE public.doc_gen_documentos
       SET status = 'EMITIDO',
           numero = v_numero,
           data_documento = v_data,
           emitido_por = auth.jwt() ->> 'email',
           emitido_em = NOW()
     WHERE id = v_doc.id;
    PERFORM set_config('docgen.emitindo', 'off', true);

    -- A versão salva que vira o documento oficial fica congelada.
    UPDATE public.doc_gen_documento_versoes
       SET congelada = true
     WHERE documento_id = v_doc.id AND versao = v_doc.versao;

    RETURN v_numero;
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_emitir(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_emitir(UUID, JSONB) TO authenticated;
