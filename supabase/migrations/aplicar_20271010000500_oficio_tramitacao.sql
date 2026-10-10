-- ============================================================================
-- Documentos › Ofícios — F4: TRAMITAÇÃO (10/10/2026)
--
-- Plano: docs/planos/2026-10-07-gerador-de-oficios.md (Frente F4 — Fase 2 da
-- proposta: aprovação, assinatura, recebimento/resposta/encerramento, prazo,
-- relacionamento entre documentos).
--
-- 1. APROVAÇÃO — o ofício entra na primitiva única (`approvalService`):
--    `approval_status/approval_chain/approval_required_levels` no documento e
--    um ramo `doc_gen_documento` na fila `fn_approval_action_queue`. O MODELO
--    diz se exige (`exige_aprovacao`). Regras de banco (não só da tela):
--      • em aprovação (PENDENTE) o texto não muda — retira-se antes;
--      • aprovado e depois alterado volta a RASCUNHO (a aprovação era do texto
--        anterior);
--      • `doc_gen_emitir` recusa emitir em aprovação, e recusa sem aprovação
--        quando o modelo exige.
--
-- 2. ASSINATURA ELETRÔNICA INTERNA — `doc_gen_assinaturas` + RPC
--    `doc_gen_assinar`: o próprio usuário assina a VERSÃO salva do rascunho, e
--    só se for um dos signatários. Salvar de novo sobe a versão e a assinatura
--    antiga deixa de valer (fica no histórico). O PDF imprime "Assinado
--    eletronicamente por X em Y". O modelo pode exigir todas as assinaturas
--    antes de emitir (`exige_assinatura`). ZapSign/ICP-Brasil continuam
--    pendência futura (decisão do usuário, 07/10).
--
-- 3. TRAMITAÇÃO DEPOIS DA EMISSÃO — situações ENVIADO, RECEBIDO, RESPONDIDO,
--    ENCERRADO (e CANCELADO), só pela RPC `doc_gen_tramitar`, que valida a
--    transição e registra o evento com os dados (canal, protocolo, quem
--    recebeu…). O gatilho de congelamento passa a recusar mudança de situação
--    fora dela.
--
-- 4. HISTÓRICO — `doc_gen_eventos`: um gatilho registra toda mudança de
--    situação e de aprovação; a assinatura registra a sua. Sem policy de
--    escrita: ninguém grava evento à mão.
--
-- 5. RELACIONAMENTO — `doc_gen_vinculos`: de/para entre ofícios do sistema e
--    documentos do GED (ex.: o ofício RECEBIDO de terceiro, arquivado no GED,
--    RESPONDE ao nosso). O vínculo "RESPONDE" de um ofício emitido não se
--    apaga — é o que o PDF citou.
--
-- REGRA #7: toda função SECURITY DEFINER nova leva REVOKE de PUBLIC/anon e
-- confere a organização DENTRO dela. Nenhuma policy com OR solto.
--
-- `fn_approval_action_queue` e `doc_gen_emitir` reescritas a partir dos
-- ARQUIVOS (aplicar_20270926000131 — conferido igual ao banco em 10/10 — e
-- aplicar_20271010000100), não do banco.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Colunas novas ────────────────────────────────────────────────────────
ALTER TABLE public.doc_gen_modelos
    ADD COLUMN IF NOT EXISTS exige_aprovacao  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_assinatura BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.doc_gen_modelos.exige_aprovacao IS
  'Ofício deste modelo só é emitido depois de APROVADO na fila de aprovação.';
COMMENT ON COLUMN public.doc_gen_modelos.exige_assinatura IS
  'Ofício deste modelo só é emitido com a assinatura eletrônica de todos os signatários na versão salva.';

ALTER TABLE public.doc_gen_documentos
    ADD COLUMN IF NOT EXISTS approval_status          TEXT NOT NULL DEFAULT 'RASCUNHO',
    ADD COLUMN IF NOT EXISTS approval_chain           JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS approval_required_levels INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.doc_gen_documentos DROP CONSTRAINT IF EXISTS doc_gen_documentos_approval_status_check;
ALTER TABLE public.doc_gen_documentos ADD CONSTRAINT doc_gen_documentos_approval_status_check
    CHECK (approval_status IN ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO'));

ALTER TABLE public.doc_gen_documentos DROP CONSTRAINT IF EXISTS doc_gen_documentos_status_check;
ALTER TABLE public.doc_gen_documentos ADD CONSTRAINT doc_gen_documentos_status_check
    CHECK (status IN ('RASCUNHO', 'EMITIDO', 'ENVIADO', 'RECEBIDO', 'RESPONDIDO', 'ENCERRADO', 'CANCELADO'));

CREATE INDEX IF NOT EXISTS doc_gen_documentos_aprovacao_idx
    ON public.doc_gen_documentos(organization_id) WHERE approval_status = 'PENDENTE';

-- ── 2. Histórico de eventos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_eventos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id    UUID NOT NULL REFERENCES public.doc_gen_documentos(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL,
    dados           JSONB NOT NULL DEFAULT '{}'::jsonb,
    autor           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.doc_gen_eventos IS
  'Linha do tempo do documento (aprovação, assinatura, emissão, envio, recebimento, resposta…). Só funções gravam.';
CREATE INDEX IF NOT EXISTS doc_gen_eventos_doc_idx ON public.doc_gen_eventos(documento_id, created_at);

ALTER TABLE public.doc_gen_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_gen_eventos_select ON public.doc_gen_eventos;
CREATE POLICY doc_gen_eventos_select ON public.doc_gen_eventos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- ── 3. Assinaturas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_assinaturas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id    UUID NOT NULL REFERENCES public.doc_gen_documentos(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- organization_members.id (o `memberId` do signatário no documento).
    member_id       UUID NOT NULL,
    nome            TEXT NOT NULL,
    email           TEXT,
    -- Versão do rascunho que foi assinada: salvar de novo invalida.
    versao          INTEGER NOT NULL,
    assinado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (documento_id, member_id, versao)
);
COMMENT ON TABLE public.doc_gen_assinaturas IS
  'Assinatura eletrônica interna: o próprio signatário assina a versão salva. Só a RPC doc_gen_assinar grava.';
CREATE INDEX IF NOT EXISTS doc_gen_assinaturas_doc_idx ON public.doc_gen_assinaturas(documento_id, versao);

ALTER TABLE public.doc_gen_assinaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_gen_assinaturas_select ON public.doc_gen_assinaturas;
CREATE POLICY doc_gen_assinaturas_select ON public.doc_gen_assinaturas
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- ── 4. Vínculos entre documentos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_gen_vinculos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- "DE <tipo> PARA": de_ RESPONDE a para_; de_ RETIFICA para_; …
    de_documento_id    UUID REFERENCES public.doc_gen_documentos(id) ON DELETE CASCADE,
    de_ged_id          UUID REFERENCES public.opura_documents(id) ON DELETE CASCADE,
    para_documento_id  UUID REFERENCES public.doc_gen_documentos(id) ON DELETE CASCADE,
    para_ged_id        UUID REFERENCES public.opura_documents(id) ON DELETE CASCADE,
    tipo               TEXT NOT NULL CHECK (tipo IN ('RESPONDE', 'ENCAMINHA', 'RETIFICA', 'REFERENCIA')),
    observacao         TEXT,
    created_by         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT doc_gen_vinculos_um_de   CHECK (num_nonnulls(de_documento_id, de_ged_id) = 1),
    CONSTRAINT doc_gen_vinculos_um_para CHECK (num_nonnulls(para_documento_id, para_ged_id) = 1),
    CONSTRAINT doc_gen_vinculos_nao_si_mesmo CHECK (de_documento_id IS NULL OR de_documento_id IS DISTINCT FROM para_documento_id)
);
COMMENT ON TABLE public.doc_gen_vinculos IS
  'Relacionamento entre documentos: ofício do sistema ou documento do GED (ex.: ofício recebido) — DE <tipo> PARA.';
CREATE UNIQUE INDEX IF NOT EXISTS doc_gen_vinculos_unico ON public.doc_gen_vinculos(
    tipo, COALESCE(de_documento_id, de_ged_id), COALESCE(para_documento_id, para_ged_id));
CREATE INDEX IF NOT EXISTS doc_gen_vinculos_de_doc_idx   ON public.doc_gen_vinculos(de_documento_id)   WHERE de_documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_gen_vinculos_para_doc_idx ON public.doc_gen_vinculos(para_documento_id) WHERE para_documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_gen_vinculos_de_ged_idx   ON public.doc_gen_vinculos(de_ged_id)         WHERE de_ged_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_gen_vinculos_para_ged_idx ON public.doc_gen_vinculos(para_ged_id)       WHERE para_ged_id IS NOT NULL;

ALTER TABLE public.doc_gen_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_gen_vinculos_select ON public.doc_gen_vinculos;
CREATE POLICY doc_gen_vinculos_select ON public.doc_gen_vinculos
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS doc_gen_vinculos_insert ON public.doc_gen_vinculos;
CREATE POLICY doc_gen_vinculos_insert ON public.doc_gen_vinculos
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
-- O "em resposta a" de um ofício já emitido foi impresso no PDF: não se desfaz.
DROP POLICY IF EXISTS doc_gen_vinculos_delete ON public.doc_gen_vinculos;
CREATE POLICY doc_gen_vinculos_delete ON public.doc_gen_vinculos
    FOR DELETE TO authenticated USING (
        public.is_org_member(organization_id)
        AND NOT (
            tipo = 'RESPONDE'
            AND de_documento_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.doc_gen_documentos d WHERE d.id = de_documento_id AND d.status <> 'RASCUNHO')
        )
    );

-- ── 5. Congelamento (reescrita de aplicar_20271008000200 §2) ────────────────
CREATE OR REPLACE FUNCTION public.fn_doc_gen_congelar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $X$
DECLARE
    v_emitindo   BOOLEAN := COALESCE(current_setting('docgen.emitindo', true), '') = 'on';
    v_tramitando BOOLEAN := COALESCE(current_setting('docgen.tramitando', true), '') = 'on';
    v_livres TEXT[] := ARRAY['status', 'ged_document_id', 'ged_version_id', 'resposta_esperada_ate', 'updated_at'];
    -- O que a aprovação e o prazo mudam sem mexer no texto do rascunho.
    v_fora_do_texto TEXT[] := ARRAY['approval_status', 'approval_chain', 'approval_required_levels', 'resposta_esperada_ate', 'updated_at'];
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
        IF NOT v_emitindo AND (to_jsonb(OLD) - v_fora_do_texto) IS DISTINCT FROM (to_jsonb(NEW) - v_fora_do_texto) THEN
            IF OLD.approval_status = 'PENDENTE' AND NEW.approval_status = 'PENDENTE' THEN
                RAISE EXCEPTION 'Ofício em aprovação não pode ser alterado — retire da aprovação para editar.' USING ERRCODE = '42501';
            END IF;
            -- A aprovação era do texto anterior: alterou, volta a precisar.
            IF OLD.approval_status = 'APROVADO' AND NEW.approval_status = 'APROVADO' THEN
                NEW.approval_status := 'RASCUNHO';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Emitido em diante: o conteúdo não muda mais.
    IF (to_jsonb(OLD) - v_livres) IS DISTINCT FROM (to_jsonb(NEW) - v_livres) THEN
        RAISE EXCEPTION 'Documento emitido não pode ser alterado — gere uma nova revisão.' USING ERRCODE = '42501';
    END IF;
    -- A situação só anda pela tramitação (que valida a transição e registra o evento).
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_tramitando THEN
        RAISE EXCEPTION 'A situação de um documento emitido só muda pela tramitação.' USING ERRCODE = '42501';
    END IF;
    -- O arquivo do GED é registrado uma vez; depois, só lê.
    IF OLD.ged_document_id IS NOT NULL AND NEW.ged_document_id IS DISTINCT FROM OLD.ged_document_id THEN
        RAISE EXCEPTION 'O arquivo do documento emitido já está registrado no GED.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$X$;

-- Função de gatilho: ninguém a chama direto (o gatilho dispara sem EXECUTE —
-- provado em 10/10 com o gatilho do histórico, que não tem EXECUTE para ninguém).
REVOKE ALL ON FUNCTION public.fn_doc_gen_congelar() FROM PUBLIC, anon;

-- ── 6. Gatilho do histórico ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_doc_gen_registrar_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_dados JSONB := COALESCE(NULLIF(current_setting('docgen.evento_dados', true), '')::jsonb, '{}'::jsonb);
    v_autor TEXT := COALESCE(auth.jwt() ->> 'email', session_user::text);
    v_passo JSONB := NEW.approval_chain -> -1;
    v_tipo  TEXT;
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
        VALUES (NEW.id, NEW.organization_id, NEW.status, v_dados || jsonb_build_object('de', OLD.status), v_autor);
    END IF;

    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        v_tipo := CASE NEW.approval_status
            WHEN 'PENDENTE'  THEN 'APROVACAO_SOLICITADA'
            WHEN 'APROVADO'  THEN 'APROVADO'
            WHEN 'REJEITADO' THEN 'REJEITADO'
            ELSE 'APROVACAO_DESFEITA'
        END;
        INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
        VALUES (NEW.id, NEW.organization_id, v_tipo,
                jsonb_strip_nulls(jsonb_build_object(
                    'nivel',  CASE WHEN v_tipo IN ('APROVADO', 'REJEITADO') THEN v_passo -> 'level' END,
                    'notas',  CASE WHEN v_tipo IN ('APROVADO', 'REJEITADO') THEN v_passo -> 'notes' END,
                    'motivo', CASE WHEN v_tipo = 'APROVACAO_DESFEITA' AND OLD.approval_status = 'APROVADO'
                                   THEN to_jsonb('Texto alterado depois da aprovação'::text) END)),
                CASE WHEN v_tipo IN ('APROVADO', 'REJEITADO') THEN COALESCE(v_passo ->> 'approved_by', v_autor) ELSE v_autor END);
    ELSIF NEW.approval_status = 'PENDENTE'
          AND jsonb_array_length(NEW.approval_chain) > jsonb_array_length(OLD.approval_chain) THEN
        -- Aprovou um nível de dois: continua PENDENTE, mas a decisão fica no histórico.
        INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
        VALUES (NEW.id, NEW.organization_id, 'APROVADO_NIVEL',
                jsonb_strip_nulls(jsonb_build_object('nivel', v_passo -> 'level', 'notas', v_passo -> 'notes')),
                COALESCE(v_passo ->> 'approved_by', v_autor));
    END IF;
    RETURN NULL;
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_doc_gen_registrar_evento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_doc_gen_registrar_evento ON public.doc_gen_documentos;
CREATE TRIGGER trg_doc_gen_registrar_evento
    AFTER UPDATE ON public.doc_gen_documentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_doc_gen_registrar_evento();

-- ── 7. Assinar ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doc_gen_assinar(p_documento_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_doc     public.doc_gen_documentos%ROWTYPE;
    v_membro  RECORD;
    v_exige   BOOLEAN;
    v_quando  TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Autorização AQUI DENTRO (REGRA #7): quem assina é o membro da sessão.
    SELECT m.id, COALESCE(NULLIF(btrim(m.name), ''), split_part(m.email, '@', 1)) AS nome, m.email
      INTO v_membro
      FROM public.organization_members m
     WHERE m.organization_id = v_doc.organization_id
       AND (m.user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    IF v_doc.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'O ofício já foi emitido — a assinatura é antes da emissão.' USING ERRCODE = '22023';
    END IF;
    IF v_doc.approval_status = 'PENDENTE' THEN
        RAISE EXCEPTION 'O ofício está em aprovação — assine depois da decisão.' USING ERRCODE = '22023';
    END IF;
    SELECT exige_aprovacao INTO v_exige FROM public.doc_gen_modelos WHERE id = v_doc.modelo_id;
    IF COALESCE(v_exige, false) AND v_doc.approval_status <> 'APROVADO' THEN
        RAISE EXCEPTION 'Este modelo exige aprovação antes da assinatura.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_doc.signatarios, '[]'::jsonb)) s
         WHERE s ->> 'memberId' = v_membro.id::text
    ) THEN
        RAISE EXCEPTION 'Você não é signatário deste ofício.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.doc_gen_assinaturas (documento_id, organization_id, member_id, nome, email, versao)
    VALUES (v_doc.id, v_doc.organization_id, v_membro.id, v_membro.nome, v_membro.email, v_doc.versao)
    ON CONFLICT (documento_id, member_id, versao) DO NOTHING
    RETURNING assinado_em INTO v_quando;

    IF v_quando IS NULL THEN
        -- Segundo clique: devolve a assinatura que já existe.
        SELECT assinado_em INTO v_quando FROM public.doc_gen_assinaturas
         WHERE documento_id = v_doc.id AND member_id = v_membro.id AND versao = v_doc.versao;
        RETURN v_quando;
    END IF;

    INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
    VALUES (v_doc.id, v_doc.organization_id, 'ASSINADO',
            jsonb_build_object('nome', v_membro.nome, 'versao', v_doc.versao), v_membro.email);
    RETURN v_quando;
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_assinar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_assinar(UUID) TO authenticated;

-- ── 8. Tramitar ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doc_gen_tramitar(p_documento_id UUID, p_para TEXT, p_dados JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_doc       public.doc_gen_documentos%ROWTYPE;
    v_permitido TEXT[];
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

    -- Mesma situação: nada a fazer (segundo clique).
    IF v_doc.status = p_para THEN
        RETURN v_doc.status;
    END IF;

    v_permitido := CASE v_doc.status
        WHEN 'EMITIDO'    THEN ARRAY['ENVIADO', 'RECEBIDO', 'RESPONDIDO', 'ENCERRADO', 'CANCELADO']
        WHEN 'ENVIADO'    THEN ARRAY['RECEBIDO', 'RESPONDIDO', 'ENCERRADO', 'CANCELADO']
        WHEN 'RECEBIDO'   THEN ARRAY['RESPONDIDO', 'ENCERRADO', 'CANCELADO']
        WHEN 'RESPONDIDO' THEN ARRAY['ENCERRADO']
        ELSE ARRAY[]::TEXT[]
    END;
    IF NOT (p_para = ANY(v_permitido)) THEN
        RAISE EXCEPTION 'Transição não permitida: % → %.', v_doc.status, p_para USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('docgen.tramitando', 'on', true);
    PERFORM set_config('docgen.evento_dados', COALESCE(p_dados, '{}'::jsonb)::text, true);
    UPDATE public.doc_gen_documentos SET status = p_para WHERE id = v_doc.id;
    PERFORM set_config('docgen.tramitando', 'off', true);
    PERFORM set_config('docgen.evento_dados', '', true);

    RETURN p_para;
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_tramitar(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_tramitar(UUID, TEXT, JSONB) TO authenticated;

-- ── 9. Emitir (reescrita de aplicar_20271010000100) ─────────────────────────
-- Muda só: as travas de aprovação e assinatura antes de reservar o número, e o
-- número no evento EMITIDO.
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
    v_exige_apr BOOLEAN;
    v_exige_ass BOOLEAN;
    v_faltam    TEXT;
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
    IF v_doc.status <> 'RASCUNHO' AND v_doc.numero IS NOT NULL AND v_doc.status <> 'CANCELADO' THEN
        RETURN v_doc.numero;
    END IF;
    IF v_doc.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'Só rascunho pode ser emitido.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_doc.assunto), '') = '' OR v_doc.destinatario_snapshot IS NULL THEN
        RAISE EXCEPTION 'Documento sem assunto ou sem destinatário — não pode ser emitido.' USING ERRCODE = '22023';
    END IF;

    -- F4: aprovação e assinatura (o modelo diz o que exige).
    SELECT exige_aprovacao, exige_assinatura INTO v_exige_apr, v_exige_ass
      FROM public.doc_gen_modelos WHERE id = v_doc.modelo_id;
    IF v_doc.approval_status = 'PENDENTE' THEN
        RAISE EXCEPTION 'O ofício está em aprovação — aguarde a decisão para emitir.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_exige_apr, false) AND v_doc.approval_status <> 'APROVADO' THEN
        RAISE EXCEPTION 'Este modelo exige aprovação antes da emissão.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_exige_ass, false) THEN
        SELECT string_agg(s ->> 'nome', ', ') INTO v_faltam
          FROM jsonb_array_elements(COALESCE(v_doc.signatarios, '[]'::jsonb)) s
         WHERE NOT EXISTS (
            SELECT 1 FROM public.doc_gen_assinaturas a
             WHERE a.documento_id = v_doc.id AND a.versao = v_doc.versao AND a.member_id::text = s ->> 'memberId'
         );
        IF v_faltam IS NOT NULL THEN
            RAISE EXCEPTION 'Falta a assinatura de: %.', v_faltam USING ERRCODE = '22023';
        END IF;
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
    PERFORM set_config('docgen.evento_dados', jsonb_build_object('numero', v_numero)::text, true);
    UPDATE public.doc_gen_documentos
       SET status = 'EMITIDO',
           numero = v_numero,
           data_documento = v_data,
           emitido_por = auth.jwt() ->> 'email',
           emitido_em = NOW()
     WHERE id = v_doc.id;
    PERFORM set_config('docgen.emitindo', 'off', true);
    PERFORM set_config('docgen.evento_dados', '', true);

    -- A versão salva que vira o documento oficial fica congelada.
    UPDATE public.doc_gen_documento_versoes
       SET congelada = true
     WHERE documento_id = v_doc.id AND versao = v_doc.versao;

    RETURN v_numero;
END;
$X$;

REVOKE ALL ON FUNCTION public.doc_gen_emitir(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_emitir(UUID, JSONB) TO authenticated;

-- ── 10. Fila de aprovação (reescrita de aplicar_20270926000131) ─────────────
-- Corpo INTEIRO (CREATE OR REPLACE substitui tudo; conferido igual ao do banco
-- em 10/10 antes de copiar). Muda só: um ramo novo, `doc_gen_documento`, antes
-- do ORDER BY.
CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  entity                   TEXT,
  id                       UUID,
  title                    TEXT,
  party_name               TEXT,
  project_name             TEXT,
  amount                   NUMERIC,
  due_date                 DATE,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  -- TRANSAÇÕES (saídas)
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1)
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = ANY(v_targets)
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = t.organization_id AND c.is_active
        AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1)
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = ANY(v_targets)
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = k.organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- COMPRAS (purchase_orders) — valor = Σ items[] (cotado quando houver, senão
  -- referência — mesma regra de utils/pedidoItemValor.ts); escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1)
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(COALESCE((it->>'quotedTotal')::numeric, (it->>'total')::numeric)), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = ANY(v_targets)
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = cmp.org_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

  UNION ALL
  -- PLANTA PUBLICADA (blueprint_snapshots)
  --
  -- ⚠️ A condicao aqui e DIFERENTE das tres acima, de proposito. Elas exigem que
  -- o item caia numa faixa de `financial_approval_config` -- porque sao sobre
  -- DINHEIRO, e a faixa e que diz se aquele valor precisa de aprovacao. Uma
  -- revisao de planta nao tem valor: `submit` e chamado com `amount: 0`, como o
  -- proprio approvalService manda fazer para entidade nao monetaria.
  --
  -- Entao o criterio e outro: esta na fila o que ALGUEM ENVIOU. Copiar a
  -- condicao de faixa traria toda revisao publicada para a fila (ou nenhuma,
  -- conforme a organizacao tenha ou nao uma faixa comecando em zero) -- e uma
  -- fila que enche sozinha e uma fila que ninguem olha.
  SELECT
    'blueprint_snapshot'::text,
    bs.id,
    COALESCE(NULLIF(st.name, ''), '(planta sem nome)') || ' - revisao ' || bs.revision::text,
    NULL::text,
    p.name,
    0::numeric,
    NULL::date,
    COALESCE(bs.approval_status, 'RASCUNHO'),
    COALESCE(bs.approval_chain, '[]'::jsonb),
    COALESCE(bs.approval_required_levels, 1)
  FROM public.blueprint_snapshots bs
  JOIN public.blueprint_studies st ON st.id = bs.study_id
  LEFT JOIN public.projects p ON p.id = st.project_id
  WHERE bs.organization_id = ANY(v_targets)
    AND bs.approval_status = 'PENDENTE'

  UNION ALL
  -- SOLICITAÇÕES DE COMPRA (purchase_requests)
  --
  -- ⚠️ Critério igual ao da planta, NÃO ao das compras: está na fila o que
  -- ALGUÉM ENVIOU. A SC é submetida com `semFaixa: 'exigir1'` — toda SC pede
  -- ao menos o nível 1, inclusive a que ainda não tem preço (valor 0). Exigir
  -- que o valor caia numa faixa deixaria essa SC PENDENTE e fora da fila, ou
  -- seja, esperando uma aprovação que ninguém vê.
  SELECT
    'purchase_request'::text,
    pr.id,
    -- Sem a palavra "Solicitação": a Central já mostra a etiqueta da entidade
    -- ao lado, e a linha lia "Solicitação Solicitação SC-…" (teste de 26/09).
    COALESCE(pr.number || ' — ', '') || pr.title,
    pr.requested_by_name,
    p.name,
    pr.estimated_total,
    pr.need_date,
    pr.approval_status,
    pr.approval_chain,
    pr.approval_required_levels
  FROM public.purchase_requests pr
  LEFT JOIN public.projects p ON p.id = pr.project_id
  WHERE pr.organization_id = ANY(v_targets)
    AND pr.approval_status = 'PENDENTE'
    AND pr.cancelled_at IS NULL

  UNION ALL
  -- OFÍCIOS (doc_gen_documentos) — 10/10/2026, Documentos › Ofícios F4.
  --
  -- ⚠️ Critério da planta e da SC: está na fila o que ALGUÉM ENVIOU. Ofício não
  -- tem valor (amount 0, `semFaixa: 'exigir1'`). Só rascunho: emitido não
  -- volta para a fila.
  SELECT
    'doc_gen_documento'::text,
    d.id,
    COALESCE(NULLIF(btrim(d.assunto), ''), '(ofício sem assunto)'),
    d.destinatario_snapshot ->> 'razao_social',
    p.name,
    0::numeric,
    d.resposta_esperada_ate,
    d.approval_status,
    d.approval_chain,
    d.approval_required_levels
  FROM public.doc_gen_documentos d
  LEFT JOIN public.projects p ON p.id = d.project_id
  WHERE d.organization_id = ANY(v_targets)
    AND d.approval_status = 'PENDENTE'
    AND d.status = 'RASCUNHO'

  -- ⚠️ O ORDER BY e do CONJUNTO, e por isso vem depois do ultimo ramo. Ele
  -- estava no fim do terceiro ramo, e emendar o quarto abaixo dele o deixaria
  -- ordenando so uma parte -- que o Postgres recusa, e com razao.
  ORDER BY due_date NULLS LAST, amount DESC;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_approval_action_queue(uuid) TO authenticated;
