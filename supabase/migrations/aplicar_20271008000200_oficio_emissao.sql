-- ============================================================================
-- Documentos › Ofícios — F3: EMISSÃO (número, congelamento, hash no GED)
-- (08/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F3)
--
-- 1. NOMENCLATURA — o ofício entra no mesmo motor dos outros 12 documentos
--    (decisão do usuário: estender a Nomenclatura, não criar série paralela):
--      • doc_type 'OFICIO' no CHECK;
--      • `year_suffix`: termina o número em "/2026" e REINICIA a sequência a cada
--        ano (o ano entra no scope_key do contador);
--      • `company_departments.sigla`: o código do departamento no número
--        (OF-ENG-047/2026).
--    `fn_format_document_number` de 6 argumentos (usada pelos triggers de
--    Serviços) NÃO muda: a de 8 argumentos chama a de 6 e só acrescenta o ano.
--
-- 2. EMISSÃO — `doc_gen_emitir` (SECURITY DEFINER): trava o rascunho, reserva
--    o número, marca EMITIDO e congela a última versão do documento, tudo numa
--    transação. Idempotente: emitido devolve o número que já tem.
--    O gatilho `trg_doc_gen_congelar` recusa qualquer outro caminho para
--    "emitir" (PATCH direto com status/número) — a função liga uma permissão
--    local à transação (`docgen.emitindo`), que o cliente não tem como ligar:
--    `set_config` está em pg_catalog, fora do que o PostgREST expõe.
--    Emitido: só cancelar (EMITIDO → CANCELADO) e registrar o arquivo do GED.
--
-- 3. GED — hash, metadados e congelamento (decisão do usuário: "documento
--    emitido no GED não se exclui, só se cancela"):
--      • `opura_document_versions.sha256` e `.congelada`;
--      • `opura_documents.metadados` (número, assunto, destinatário…);
--      • versão congelada não muda nem é apagada; documento cuja versão ativa
--        está congelada não recebe versão nova, não troca a ativa e não é
--        excluído (mensagem clara antes do CASCADE, não erro de cascata).
--    Os gatilhos valem para TODO documento do GED que nascer congelado.
--
-- REGRA #7: a única função SECURITY DEFINER nova (doc_gen_emitir) leva REVOKE
-- de PUBLIC/anon e confere a organização DENTRO dela.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Nomenclatura ─────────────────────────────────────────────────────────
ALTER TABLE public.company_departments ADD COLUMN IF NOT EXISTS sigla TEXT;
COMMENT ON COLUMN public.company_departments.sigla IS
  'Código curto do departamento usado na numeração de documentos (ex.: ENG em OF-ENG-047/2026).';

ALTER TABLE public.document_numbering_settings
    ADD COLUMN IF NOT EXISTS year_suffix BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.document_numbering_settings.year_suffix IS
  'Termina o número em "/<ano>" e reinicia a sequência a cada ano (o ano entra no scope_key).';

-- CHECK recriado com a lista inteira (services/documentNumbering/types.ts).
ALTER TABLE public.document_numbering_settings
    DROP CONSTRAINT IF EXISTS document_numbering_settings_doc_type_check;
ALTER TABLE public.document_numbering_settings
    ADD CONSTRAINT document_numbering_settings_doc_type_check CHECK (doc_type IN (
        'PURCHASE_ORDER', 'QUOTATION', 'SUPPLY_CONTRACT',
        'SERVICE_CONTRACT', 'SERVICE_PROPOSAL', 'SERVICE_CRM_CONTRACT',
        'UNIT_SALE_CONTRACT', 'RENTAL_CONTRACT',
        'SALE_DEAL', 'RENTAL_DEAL', 'CONDO_RATEIO',
        'PURCHASE_REQUEST',
        'OFICIO'
    ));

-- Formatação com o sufixo de ano. A de 6 argumentos fica como está.
CREATE OR REPLACE FUNCTION public.fn_format_document_number(
    p_slots JSONB, p_values JSONB, p_prefix TEXT, p_separator TEXT, p_seq INTEGER, p_seq_padding SMALLINT,
    p_year_suffix BOOLEAN, p_year INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $X$
DECLARE
    v_base TEXT := public.fn_format_document_number(p_slots, p_values, p_prefix, p_separator, p_seq, p_seq_padding);
BEGIN
    IF COALESCE(p_year_suffix, false) AND p_year IS NOT NULL THEN
        RETURN v_base || '/' || p_year::TEXT;
    END IF;
    RETURN v_base;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_format_document_number(JSONB, JSONB, TEXT, TEXT, INTEGER, SMALLINT, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_format_document_number(JSONB, JSONB, TEXT, TEXT, INTEGER, SMALLINT, BOOLEAN, INTEGER) TO authenticated;

-- ── 2. Ofício: congelamento ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_doc_gen_congelar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $X$
DECLARE
    v_emitindo BOOLEAN := COALESCE(current_setting('docgen.emitindo', true), '') = 'on';
    v_livres TEXT[] := ARRAY['status', 'ged_document_id', 'ged_version_id', 'resposta_esperada_ate', 'updated_at'];
BEGIN
    IF OLD.status = 'RASCUNHO' THEN
        -- Só a função de emissão tira um documento de RASCUNHO e dá número a ele.
        IF NOT v_emitindo AND (
            NEW.status IS DISTINCT FROM OLD.status
            OR NEW.numero IS DISTINCT FROM OLD.numero
            OR NEW.emitido_por IS DISTINCT FROM OLD.emitido_por
            OR NEW.emitido_em IS DISTINCT FROM OLD.emitido_em
        ) THEN
            RAISE EXCEPTION 'O documento só é emitido pela função de emissão (número oficial).' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- Emitido/cancelado: o conteúdo não muda mais.
    IF (to_jsonb(OLD) - v_livres) IS DISTINCT FROM (to_jsonb(NEW) - v_livres) THEN
        RAISE EXCEPTION 'Documento emitido não pode ser alterado — gere uma nova revisão.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'EMITIDO' AND NEW.status = 'CANCELADO') THEN
        RAISE EXCEPTION 'Documento emitido só pode ser cancelado.' USING ERRCODE = '42501';
    END IF;
    -- O arquivo do GED é registrado uma vez; depois, só lê.
    IF OLD.ged_document_id IS NOT NULL AND NEW.ged_document_id IS DISTINCT FROM OLD.ged_document_id THEN
        RAISE EXCEPTION 'O arquivo do documento emitido já está registrado no GED.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$X$;

DROP TRIGGER IF EXISTS trg_doc_gen_congelar ON public.doc_gen_documentos;
CREATE TRIGGER trg_doc_gen_congelar
    BEFORE UPDATE ON public.doc_gen_documentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_doc_gen_congelar();

-- ── 3. Ofício: emissão ──────────────────────────────────────────────────────
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
        v_separator := '-';
        v_padding := 3;
        v_year_suf := true;
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

-- ── 4. GED: hash, metadados, congelamento ───────────────────────────────────
ALTER TABLE public.opura_document_versions ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE public.opura_document_versions ADD COLUMN IF NOT EXISTS congelada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.opura_documents ADD COLUMN IF NOT EXISTS metadados JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.opura_document_versions.sha256 IS 'SHA-256 (hex) do arquivo desta versão, calculado no envio.';
COMMENT ON COLUMN public.opura_document_versions.congelada IS 'Versão oficial (ex.: ofício emitido): não muda, não é apagada, e o documento não recebe outra.';
COMMENT ON COLUMN public.opura_documents.metadados IS 'Metadados do produtor do documento (ofício: número, assunto, destinatário, modelo…).';

-- Versão congelada: imutável e não apagável.
CREATE OR REPLACE FUNCTION public.fn_opura_versao_congelada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $X$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.congelada THEN
            RAISE EXCEPTION 'Versão congelada (documento emitido) não pode ser apagada.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM public.opura_documents d
              JOIN public.opura_document_versions v ON v.id = d.active_version_id
             WHERE d.id = NEW.document_id AND v.congelada
        ) THEN
            RAISE EXCEPTION 'Documento emitido (versão congelada) não recebe nova versão — gere uma nova revisão no módulo de origem.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;
    -- UPDATE
    IF OLD.congelada AND (
        NEW.congelada IS DISTINCT FROM OLD.congelada
        OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
        OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
        OR NEW.tamanho IS DISTINCT FROM OLD.tamanho
        OR NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.version_number IS DISTINCT FROM OLD.version_number
    ) THEN
        RAISE EXCEPTION 'Versão congelada (documento emitido) não pode ser alterada.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$X$;

DROP TRIGGER IF EXISTS trg_opura_versao_congelada ON public.opura_document_versions;
CREATE TRIGGER trg_opura_versao_congelada
    BEFORE INSERT OR UPDATE OR DELETE ON public.opura_document_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_versao_congelada();

-- Documento com versão ativa congelada: não troca a ativa e não é excluído.
CREATE OR REPLACE FUNCTION public.fn_opura_documento_congelado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $X$
DECLARE
    v_congelado BOOLEAN;
BEGIN
    SELECT v.congelada INTO v_congelado
      FROM public.opura_document_versions v
     WHERE v.id = OLD.active_version_id;
    IF NOT COALESCE(v_congelado, false) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Documento emitido não se exclui — cancele-o no módulo de origem.' USING ERRCODE = '42501';
    END IF;
    IF NEW.active_version_id IS DISTINCT FROM OLD.active_version_id THEN
        RAISE EXCEPTION 'Documento emitido: a versão oficial não pode ser trocada.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$X$;

DROP TRIGGER IF EXISTS trg_opura_documento_congelado ON public.opura_documents;
CREATE TRIGGER trg_opura_documento_congelado
    BEFORE UPDATE OR DELETE ON public.opura_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_documento_congelado();
