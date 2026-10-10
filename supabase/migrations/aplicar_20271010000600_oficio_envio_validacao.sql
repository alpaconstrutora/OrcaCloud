-- ============================================================================
-- Documentos › Ofícios — F5: ENVIO e VALIDAÇÃO PÚBLICA (10/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F5 — Fase 2 da
-- proposta: envio por e-mail/WhatsApp, QR Code e hash, anexos dentro do PDF).
--
-- 1. `anexos_no_pdf` — o ofício pode levar os anexos do GED DENTRO do PDF
--    (páginas rasterizadas depois do texto). Faz parte do conteúdo: congela
--    com o resto na emissão.
--
-- 2. `doc_gen_registrar_envio` — registra um envio (e-mail pela Edge Function
--    `doc-gen-enviar`, WhatsApp pelo link `wa.me`). O primeiro envio de um
--    ofício EMITIDO o leva a ENVIADO (mesmo caminho da tramitação: a permissão
--    local `docgen.tramitando`, o evento com os dados); os seguintes, ou os
--    feitos depois de RECEBIDO/RESPONDIDO, ficam no histórico como REENVIADO —
--    a situação não anda para trás.
--
-- 3. `doc_gen_validar` — o destino do QR Code impresso no PDF. Executável por
--    `anon` DE PROPÓSITO (fiscal, prefeitura, quem recebeu o ofício abre sem
--    login), no mesmo molde de `academy_validate_certificate`: o recorte vem do
--    id do documento, um UUID aleatório e não enumerável. Devolve só o que
--    autentica: número, emitente, data, destinatário, situação e o SHA-256 do
--    PDF oficial. NUNCA o caminho do arquivo no Storage (a
--    `fn_get_document_status_public` da planta expõe `storage_path` ao anon —
--    não copiar) nem assunto, conteúdo ou signatários.
--
-- REGRA #7: REVOKE de PUBLIC nas duas funções; autorização dentro da de envio;
-- a de validação só lê ofício emitido (rascunho "não existe" para o público).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Anexos dentro do PDF ─────────────────────────────────────────────────
ALTER TABLE public.doc_gen_documentos
    ADD COLUMN IF NOT EXISTS anexos_no_pdf BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.doc_gen_documentos.anexos_no_pdf IS
  'Os anexos do GED entram dentro do PDF do ofício (páginas depois do texto). Congela na emissão.';

-- ── 2. Registrar envio ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doc_gen_registrar_envio(p_documento_id UUID, p_dados JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_doc public.doc_gen_documentos%ROWTYPE;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Autorização AQUI DENTRO (REGRA #7).
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_doc.organization_id
          AND (m.user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    IF v_doc.status IN ('RASCUNHO', 'CANCELADO') THEN
        RAISE EXCEPTION 'Só ofício emitido é enviado.' USING ERRCODE = '22023';
    END IF;

    IF v_doc.status = 'EMITIDO' THEN
        PERFORM set_config('docgen.tramitando', 'on', true);
        PERFORM set_config('docgen.evento_dados', COALESCE(p_dados, '{}'::jsonb)::text, true);
        UPDATE public.doc_gen_documentos SET status = 'ENVIADO' WHERE id = v_doc.id;
        PERFORM set_config('docgen.tramitando', 'off', true);
        PERFORM set_config('docgen.evento_dados', '', true);
        RETURN 'ENVIADO';
    END IF;

    INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
    VALUES (v_doc.id, v_doc.organization_id, 'REENVIADO', COALESCE(p_dados, '{}'::jsonb), auth.jwt() ->> 'email');
    RETURN v_doc.status;
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_registrar_envio(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_registrar_envio(UUID, JSONB) TO authenticated;

-- ── 3. Validação pública (destino do QR) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doc_gen_validar(p_documento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_doc     public.doc_gen_documentos%ROWTYPE;
    v_emit    TEXT;
    v_sha     TEXT;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id;
    -- Rascunho não existe para quem está de fora.
    IF NOT FOUND OR v_doc.status = 'RASCUNHO' OR v_doc.numero IS NULL THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;

    SELECT COALESCE(NULLIF(btrim(c.nome_fantasia), ''), NULLIF(btrim(c.razao_social), '')) INTO v_emit
      FROM public.companies c WHERE c.id = v_doc.company_id;
    IF v_emit IS NULL THEN
        SELECT name INTO v_emit FROM public.organizations WHERE id = v_doc.organization_id;
    END IF;

    SELECT sha256 INTO v_sha FROM public.opura_document_versions WHERE id = v_doc.ged_version_id;

    RETURN jsonb_build_object(
        'encontrado',    true,
        'tipo',          'Ofício',
        'numero',        v_doc.numero,
        'situacao',      v_doc.status,
        'emitente',      v_emit,
        'destinatario',  v_doc.destinatario_snapshot ->> 'razao_social',
        'data',          v_doc.data_documento,
        'emitido_em',    v_doc.emitido_em,
        'sha256',        v_sha
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_validar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doc_gen_validar(UUID) TO anon, authenticated;
