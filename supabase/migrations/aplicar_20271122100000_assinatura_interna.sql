-- ═══════════════════════════════════════════════════════════════════════════
-- Assinatura eletrônica INTERNA (sem certificado) — F1: banco
-- Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md
--
-- Segundo provedor de assinatura, ao lado do ZapSign (que continua para os
-- documentos importantes). O comprador assina DENTRO do Portal do Cliente; o
-- representante da empresa dentro do app; o corretor no Portal do Corretor;
-- testemunhas por link. Confirmação: código de 6 dígitos por e-mail + CPF +
-- aceite explícito. Prova: cópia congelada do PDF (SHA-256), eventos imutáveis
-- encadeados por hash, PDF final com manifesto (F2).
--
-- Desenho:
--   • commercial_deal_documents — casa dos documentos da NEGOCIAÇÃO (proposta,
--     reserva, ficha, vistoria, distrato). contract_document_versions NÃO é
--     ampliada: contract_id NOT NULL sustenta a RLS, a projeção _syncMinutaMirror,
--     a pasta do bucket, o portal-documentos-download e o Portal do Parceiro.
--   • assinatura_envelopes / assinatura_signatarios / assinatura_eventos — o
--     envelope, comum às duas origens. Membro só LÊ (RLS de SELECT); toda escrita
--     é RPC executada pela Edge Function `assinatura-interna` (service_role).
--   • assinatura_segredos — hash do código e do link da testemunha, em tabela
--     SEM policy nenhuma: se ficassem em assinatura_signatarios, qualquer membro
--     leria o hash e acharia o código de 6 dígitos por força bruta (10⁶).
--   • bucket `assinaturas` — privado, sem policy: só a service_role toca.
--
-- Quem projeta o quê na origem:
--   SENT / CANCELLED / EXPIRED → este arquivo (assinatura_criar, _cancelar, gatilhos);
--   SIGNED + PDF assinado      → a Edge (_shared/assinaturaPropagar.ts), a MESMA
--                                regra do webhook do ZapSign (contrato só quando
--                                kind=CONTRATO; aditivo em contract_addendums).
--
-- REGRA #7: nenhuma policy com OR que libere sozinha; toda função nova com
-- REVOKE de PUBLIC/anon/authenticated e GRANT explícito ao papel que usa.
-- Aditiva do começo ao fim. Reversão: scripts/reverter-assinatura-interna.sql
-- (só com autorização — apaga a trilha de assinaturas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Documentos da negociação ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_deal_documents (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL,
    deal_id                 uuid NOT NULL,
    kind                    text NOT NULL
                              CHECK (kind IN ('PROPOSTA','RESERVA','FICHA','VISTORIA','DISTRATO','OUTRO')),
    v                       integer NOT NULL DEFAULT 1,
    nome                    text NOT NULL CHECK (length(btrim(nome)) > 0),
    notas                   text,
    storage_path            text NOT NULL,
    mime_type               text,
    size_bytes              bigint,
    source                  text NOT NULL DEFAULT 'UPLOAD' CHECK (source IN ('UPLOAD','SISTEMA')),
    -- Projeção da assinatura (só exibição; quem decide é o envelope)
    assinatura_envelope_id  uuid,
    signature_status        text CHECK (signature_status IS NULL OR signature_status IN ('SENT','SIGNED','CANCELLED','EXPIRED')),
    signed_path             text,
    signed_at               timestamptz,
    created_by              uuid DEFAULT auth.uid(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdd_deal ON public.commercial_deal_documents(deal_id, kind, v DESC);
CREATE INDEX IF NOT EXISTS idx_cdd_org  ON public.commercial_deal_documents(organization_id);

-- FK em tabela quente (commercial_deals) deadlocka: lock_timeout curto, e a
-- migration não falha se não conseguir agora (reexecutável).
DO $$
BEGIN
    SET LOCAL lock_timeout = '3s';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deal_documents_deal_fk') THEN
        ALTER TABLE public.commercial_deal_documents
            ADD CONSTRAINT commercial_deal_documents_deal_fk
            FOREIGN KEY (deal_id) REFERENCES public.commercial_deals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK deal_id não aplicada agora (%). Reexecute a migration.', SQLERRM;
END $$;

-- Coerência da linha: org = org da negociação; arquivo na pasta da negociação;
-- versão por (deal, kind); projeção de assinatura só pela service_role/RPC.
CREATE OR REPLACE FUNCTION public.commercial_deal_documents_coerencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_deal uuid;
    v_quem     text := current_user;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT d.organization_id INTO v_org_deal FROM public.commercial_deals d WHERE d.id = NEW.deal_id;
        IF v_org_deal IS NULL OR v_org_deal IS DISTINCT FROM NEW.organization_id THEN
            RAISE EXCEPTION 'Documento precisa ser da mesma organização da negociação' USING ERRCODE = '42501';
        END IF;
        IF NEW.storage_path NOT LIKE NEW.organization_id::text || '/negociacoes/' || NEW.deal_id::text || '/%'
           OR NEW.storage_path LIKE '%..%' THEN
            RAISE EXCEPTION 'Arquivo fora da pasta da negociação' USING ERRCODE = '22023';
        END IF;
        SELECT coalesce(max(x.v), 0) + 1 INTO NEW.v
          FROM public.commercial_deal_documents x
         WHERE x.deal_id = NEW.deal_id AND x.kind = NEW.kind;
        IF v_quem NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
            NEW.assinatura_envelope_id := NULL;
            NEW.signature_status := NULL;
            NEW.signed_path := NULL;
            NEW.signed_at := NULL;
            NEW.created_by := auth.uid();
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: quem não é o banco/service só muda nome e notas.
    IF v_quem NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
           OR NEW.kind IS DISTINCT FROM OLD.kind
           OR NEW.v IS DISTINCT FROM OLD.v
           OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.assinatura_envelope_id IS DISTINCT FROM OLD.assinatura_envelope_id
           OR NEW.signature_status IS DISTINCT FROM OLD.signature_status
           OR NEW.signed_path IS DISTINCT FROM OLD.signed_path
           OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Do documento da negociação só se altera nome e notas — para trocar o arquivo, suba uma nova versão'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_deal_documents_coerencia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cdd_coerencia ON public.commercial_deal_documents;
CREATE TRIGGER trg_cdd_coerencia BEFORE INSERT OR UPDATE ON public.commercial_deal_documents
    FOR EACH ROW EXECUTE FUNCTION public.commercial_deal_documents_coerencia();

CREATE OR REPLACE FUNCTION public.commercial_deal_documents_nao_apaga_assinado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.assinatura_envelope_id IS NOT NULL THEN
        RAISE EXCEPTION 'Documento que foi enviado para assinatura não se exclui — ele é a prova do que foi assinado'
            USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_deal_documents_nao_apaga_assinado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cdd_nao_apaga_assinado ON public.commercial_deal_documents;
CREATE TRIGGER trg_cdd_nao_apaga_assinado BEFORE DELETE ON public.commercial_deal_documents
    FOR EACH ROW EXECUTE FUNCTION public.commercial_deal_documents_nao_apaga_assinado();

ALTER TABLE public.commercial_deal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cdd_select ON public.commercial_deal_documents;
CREATE POLICY cdd_select ON public.commercial_deal_documents FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS cdd_insert ON public.commercial_deal_documents;
CREATE POLICY cdd_insert ON public.commercial_deal_documents FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS cdd_update ON public.commercial_deal_documents;
CREATE POLICY cdd_update ON public.commercial_deal_documents FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS cdd_delete ON public.commercial_deal_documents;
CREATE POLICY cdd_delete ON public.commercial_deal_documents FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

REVOKE ALL ON public.commercial_deal_documents FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.commercial_deal_documents FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_deal_documents TO authenticated;

-- ── 2. Versões da Emissão: provedor da assinatura ───────────────────────────
ALTER TABLE public.contract_document_versions
    ADD COLUMN IF NOT EXISTS assinatura_envelope_id uuid,
    ADD COLUMN IF NOT EXISTS signature_provider text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdv_signature_provider_check') THEN
        ALTER TABLE public.contract_document_versions
            ADD CONSTRAINT cdv_signature_provider_check
            CHECK (signature_provider IS NULL OR signature_provider IN ('ZAPSIGN','PORTAL'));
    END IF;
END $$;

COMMENT ON COLUMN public.contract_document_versions.signature_provider IS
  'Quem conduz a assinatura desta versão: ZAPSIGN (signature_token) ou PORTAL (assinatura interna, assinatura_envelope_id).';

-- ── 3. Envelope, signatários, segredos, eventos ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.assinatura_envelopes (
    id               uuid PRIMARY KEY,
    organization_id  uuid NOT NULL,
    origem_tipo      text NOT NULL CHECK (origem_tipo IN ('CDV','DEAL_DOC')),
    origem_id        uuid NOT NULL,
    contract_id      uuid,
    deal_id          uuid,
    titulo           text NOT NULL,
    status           text NOT NULL DEFAULT 'ENVIADO'
                       CHECK (status IN ('ENVIADO','FINALIZANDO','CONCLUIDO','CANCELADO','EXPIRADO')),
    expira_em        timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    original_path    text NOT NULL,
    original_sha256  text NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
    paginas          integer,
    final_path       text,
    final_sha256     text CHECK (final_sha256 IS NULL OR final_sha256 ~ '^[0-9a-f]{64}$'),
    concluido_em     timestamptz,
    criado_por       uuid,
    criado_em        timestamptz NOT NULL DEFAULT now(),
    cancelado_por    uuid,
    cancelado_em     timestamptz,
    motivo           text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_envelope_ativo
    ON public.assinatura_envelopes(origem_tipo, origem_id)
    WHERE status IN ('ENVIADO','FINALIZANDO');
CREATE INDEX IF NOT EXISTS idx_assinatura_env_org      ON public.assinatura_envelopes(organization_id);
CREATE INDEX IF NOT EXISTS idx_assinatura_env_contrato ON public.assinatura_envelopes(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assinatura_env_deal     ON public.assinatura_envelopes(deal_id) WHERE deal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.assinatura_signatarios (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id      uuid NOT NULL REFERENCES public.assinatura_envelopes(id),
    organization_id  uuid NOT NULL,
    ordem            integer NOT NULL DEFAULT 0,
    papel            text NOT NULL CHECK (papel IN ('PARTE','REPRESENTANTE','TESTEMUNHA','CORRETOR')),
    canal            text NOT NULL CHECK (canal IN ('PORTAL_CLIENTE','MEMBRO','PORTAL_CORRETOR','LINK')),
    client_id        uuid,
    user_id          uuid,
    broker_id        uuid,
    nome             text NOT NULL,
    representa       text,
    email            text NOT NULL,
    cpf              text NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
    status           text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','ASSINADO')),
    visualizou_em    timestamptz,
    assinado_em      timestamptz,
    ip               text,
    user_agent       text,
    termo_versao     text,
    criado_em        timestamptz NOT NULL DEFAULT now(),
    -- Exatamente UMA identidade, a do canal.
    CONSTRAINT assinatura_signatario_identidade CHECK (
        (canal = 'PORTAL_CLIENTE'  AND client_id IS NOT NULL AND user_id IS NULL AND broker_id IS NULL) OR
        (canal = 'MEMBRO'          AND user_id IS NOT NULL AND client_id IS NULL AND broker_id IS NULL) OR
        (canal = 'PORTAL_CORRETOR' AND broker_id IS NOT NULL AND client_id IS NULL AND user_id IS NULL) OR
        (canal = 'LINK'            AND client_id IS NULL AND user_id IS NULL AND broker_id IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_assinatura_sig_env    ON public.assinatura_signatarios(envelope_id);
CREATE INDEX IF NOT EXISTS idx_assinatura_sig_client ON public.assinatura_signatarios(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assinatura_sig_user   ON public.assinatura_signatarios(user_id)   WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assinatura_sig_broker ON public.assinatura_signatarios(broker_id) WHERE broker_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_sig_client ON public.assinatura_signatarios(envelope_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_sig_user   ON public.assinatura_signatarios(envelope_id, user_id)   WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_sig_broker ON public.assinatura_signatarios(envelope_id, broker_id) WHERE broker_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_sig_cpf    ON public.assinatura_signatarios(envelope_id, cpf, papel);

CREATE TABLE IF NOT EXISTS public.assinatura_segredos (
    signatario_id    uuid PRIMARY KEY REFERENCES public.assinatura_signatarios(id),
    link_hash        text UNIQUE,
    otp_hash         text,
    otp_expira_em    timestamptz,
    otp_tentativas   integer NOT NULL DEFAULT 0,
    bloqueado_ate    timestamptz
);

CREATE TABLE IF NOT EXISTS public.assinatura_eventos (
    id             bigserial PRIMARY KEY,
    envelope_id    uuid NOT NULL REFERENCES public.assinatura_envelopes(id),
    organization_id uuid NOT NULL,
    signatario_id  uuid REFERENCES public.assinatura_signatarios(id),
    tipo           text NOT NULL,
    dados          jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip             text,
    user_agent     text,
    criado_em      timestamptz NOT NULL DEFAULT clock_timestamp(),
    hash_anterior  text,
    hash           text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_assinatura_evt_env ON public.assinatura_eventos(envelope_id, id);
CREATE INDEX IF NOT EXISTS idx_assinatura_evt_sig ON public.assinatura_eventos(signatario_id, tipo, criado_em) WHERE signatario_id IS NOT NULL;

-- 3.1 Cadeia de hash: cada evento carrega o hash do anterior do MESMO envelope.
-- Serializado pelo FOR UPDATE do envelope nas RPCs que gravam eventos.
CREATE OR REPLACE FUNCTION public.assinatura_eventos_encadear()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    SELECT e.hash INTO NEW.hash_anterior
      FROM public.assinatura_eventos e
     WHERE e.envelope_id = NEW.envelope_id
     ORDER BY e.id DESC
     LIMIT 1;
    NEW.criado_em := clock_timestamp();
    NEW.hash := encode(extensions.digest(
        coalesce(NEW.hash_anterior, '') || '|' ||
        NEW.envelope_id::text || '|' ||
        coalesce(NEW.signatario_id::text, '') || '|' ||
        NEW.tipo || '|' ||
        NEW.dados::text || '|' ||
        coalesce(NEW.ip, '') || '|' ||
        to_char(NEW.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'sha256'), 'hex');
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_eventos_encadear() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assinatura_eventos_encadear ON public.assinatura_eventos;
CREATE TRIGGER trg_assinatura_eventos_encadear BEFORE INSERT ON public.assinatura_eventos
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_eventos_encadear();

-- 3.2 Imutabilidade (molde risk_evaluations_imutavel).
CREATE OR REPLACE FUNCTION public.assinatura_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Evento de assinatura é prova: não se altera nem se exclui' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_eventos_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assinatura_eventos_imutavel ON public.assinatura_eventos;
CREATE TRIGGER trg_assinatura_eventos_imutavel BEFORE UPDATE OR DELETE ON public.assinatura_eventos
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_eventos_imutavel();

CREATE OR REPLACE FUNCTION public.assinatura_signatarios_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Signatário de envelope não se exclui' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'ASSINADO' THEN
        RAISE EXCEPTION 'Assinatura registrada não se altera' USING ERRCODE = '42501';
    END IF;
    IF NEW.envelope_id IS DISTINCT FROM OLD.envelope_id OR NEW.cpf IS DISTINCT FROM OLD.cpf
       OR NEW.email IS DISTINCT FROM OLD.email OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.canal IS DISTINCT FROM OLD.canal OR NEW.papel IS DISTINCT FROM OLD.papel
       OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.broker_id IS DISTINCT FROM OLD.broker_id THEN
        RAISE EXCEPTION 'Identidade do signatário é congelada no envio' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_signatarios_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assinatura_signatarios_imutavel ON public.assinatura_signatarios;
CREATE TRIGGER trg_assinatura_signatarios_imutavel BEFORE UPDATE OR DELETE ON public.assinatura_signatarios
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_signatarios_imutavel();

CREATE OR REPLACE FUNCTION public.assinatura_envelopes_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Envelope de assinatura não se exclui — cancele' USING ERRCODE = '42501';
    END IF;
    IF OLD.status IN ('CONCLUIDO','CANCELADO','EXPIRADO') THEN
        RAISE EXCEPTION 'Envelope encerrado não se altera' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.origem_tipo IS DISTINCT FROM OLD.origem_tipo
       OR NEW.origem_id IS DISTINCT FROM OLD.origem_id OR NEW.original_path IS DISTINCT FROM OLD.original_path
       OR NEW.original_sha256 IS DISTINCT FROM OLD.original_sha256 THEN
        RAISE EXCEPTION 'O documento do envelope é congelado no envio' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_envelopes_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assinatura_envelopes_imutavel ON public.assinatura_envelopes;
CREATE TRIGGER trg_assinatura_envelopes_imutavel BEFORE UPDATE OR DELETE ON public.assinatura_envelopes
    FOR EACH ROW EXECUTE FUNCTION public.assinatura_envelopes_imutavel();

-- 3.3 RLS: membro da org LÊ envelope, signatários e eventos. Nenhuma policy de
-- escrita; segredos sem policy nenhuma.
ALTER TABLE public.assinatura_envelopes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_signatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eventos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_segredos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assinatura_env_select ON public.assinatura_envelopes;
CREATE POLICY assinatura_env_select ON public.assinatura_envelopes FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS assinatura_sig_select ON public.assinatura_signatarios;
CREATE POLICY assinatura_sig_select ON public.assinatura_signatarios FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
DROP POLICY IF EXISTS assinatura_evt_select ON public.assinatura_eventos;
CREATE POLICY assinatura_evt_select ON public.assinatura_eventos FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

REVOKE ALL ON public.assinatura_envelopes, public.assinatura_signatarios,
              public.assinatura_eventos, public.assinatura_segredos FROM anon, authenticated;
GRANT SELECT ON public.assinatura_envelopes, public.assinatura_signatarios,
                public.assinatura_eventos TO authenticated;
GRANT ALL ON public.assinatura_envelopes, public.assinatura_signatarios,
             public.assinatura_eventos, public.assinatura_segredos TO service_role;
REVOKE ALL ON SEQUENCE public.assinatura_eventos_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assinatura_eventos_id_seq TO service_role;

-- ── 4. Bucket privado ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assinaturas', 'assinaturas', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
    SET public = false, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];
-- Sem policy em storage.objects para este bucket: só a service_role (que ignora RLS).

-- ── 5. Auxiliares internas ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assinatura_cpf_valido(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    d   int[];
    s   int;
    dv1 int;
    dv2 int;
BEGIN
    IF p_cpf IS NULL OR p_cpf !~ '^[0-9]{11}$' OR p_cpf ~ '^(\d)\1{10}$' THEN
        RETURN false;
    END IF;
    d := ARRAY(SELECT substr(p_cpf, i, 1)::int FROM generate_series(1, 11) i);
    s := 0;
    FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
    dv1 := (s * 10) % 11; IF dv1 = 10 THEN dv1 := 0; END IF;
    s := 0;
    FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
    dv2 := (s * 10) % 11; IF dv2 = 10 THEN dv2 := 0; END IF;
    RETURN dv1 = d[10] AND dv2 = d[11];
END;
$$;
REVOKE ALL ON FUNCTION public._assinatura_cpf_valido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._assinatura_cpf_valido(text) TO service_role;

CREATE OR REPLACE FUNCTION public._assinatura_cpf_mascarado(p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN p_cpf ~ '^[0-9]{11}$'
                THEN '***.' || substr(p_cpf, 4, 3) || '.' || substr(p_cpf, 7, 3) || '-**'
                ELSE '***' END
$$;
REVOKE ALL ON FUNCTION public._assinatura_cpf_mascarado(text) FROM PUBLIC, anon, authenticated;

-- Grava um evento (sem decidir nada). Quem chama já trancou o envelope.
CREATE OR REPLACE FUNCTION public._assinatura_evento(
    p_envelope uuid, p_signatario uuid, p_tipo text, p_dados jsonb, p_ip text, p_ua text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    INSERT INTO public.assinatura_eventos (envelope_id, organization_id, signatario_id, tipo, dados, ip, user_agent)
    SELECT e.id, e.organization_id, p_signatario, p_tipo, coalesce(p_dados, '{}'::jsonb), p_ip, left(p_ua, 500)
      FROM public.assinatura_envelopes e WHERE e.id = p_envelope;
$$;
REVOKE ALL ON FUNCTION public._assinatura_evento(uuid, uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- Projeta SENT/CANCELLED/EXPIRED na origem (SIGNED é da Edge, junto com o PDF).
CREATE OR REPLACE FUNCTION public._assinatura_projetar(p_envelope uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e public.assinatura_envelopes;
BEGIN
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = p_envelope;
    IF e.id IS NULL THEN RETURN; END IF;
    IF e.origem_tipo = 'CDV' THEN
        UPDATE public.contract_document_versions
           SET assinatura_envelope_id = e.id,
               signature_provider     = 'PORTAL',
               signature_status       = p_status,
               updated_at             = now()
         WHERE id = e.origem_id
           -- SENT só nasce na criação do (único) envelope ativo: assume a origem.
           -- Os demais só valem para o envelope que ela aponta hoje.
           AND (p_status = 'SENT' OR assinatura_envelope_id = e.id);
    ELSE
        UPDATE public.commercial_deal_documents
           SET assinatura_envelope_id = e.id,
               signature_status       = p_status
         WHERE id = e.origem_id
           AND (p_status = 'SENT' OR assinatura_envelope_id = e.id);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assinatura_projetar(uuid, text) FROM PUBLIC, anon, authenticated;

-- Vencimento preguiçoso: envelope ENVIADO passado de expira_em vira EXPIRADO na
-- primeira chamada que o toca (sem cron). Devolve true se está vencido.
CREATE OR REPLACE FUNCTION public._assinatura_vencer(p_envelope uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n int;
BEGIN
    UPDATE public.assinatura_envelopes
       SET status = 'EXPIRADO', motivo = 'Prazo de assinatura vencido'
     WHERE id = p_envelope AND status = 'ENVIADO' AND expira_em < now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
        PERFORM public._assinatura_evento(p_envelope, NULL, 'EXPIROU', '{}'::jsonb, NULL, NULL);
        PERFORM public._assinatura_projetar(p_envelope, 'EXPIRED');
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.assinatura_envelopes WHERE id = p_envelope AND status = 'EXPIRADO');
END;
$$;
REVOKE ALL ON FUNCTION public._assinatura_vencer(uuid) FROM PUBLIC, anon, authenticated;

-- Autoriza quem chama a agir COMO o signatário, pelo canal dele. Mesma recusa
-- para "não existe" e "não é você" (42501). Devolve o signatário.
CREATE OR REPLACE FUNCTION public._assinatura_autorizar(
    p_signatario uuid, p_canal text, p_credencial text, p_user uuid)
RETURNS public.assinatura_signatarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    s  public.assinatura_signatarios;
    ok boolean := false;
BEGIN
    SELECT * INTO s FROM public.assinatura_signatarios WHERE id = p_signatario;
    IF s.id IS NULL OR s.canal IS DISTINCT FROM p_canal THEN
        RAISE EXCEPTION 'assinatura não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;

    IF p_canal = 'PORTAL_CLIENTE' THEN
        ok := EXISTS (SELECT 1 FROM public.client_portal_tokens t
                       WHERE t.token = p_credencial AND t.is_active AND t.expires_at > now()
                         AND t.client_id = s.client_id AND t.org_id = s.organization_id);
    ELSIF p_canal = 'PORTAL_CORRETOR' THEN
        -- Cadastro de corretor pode ser global: a identidade é o broker_id.
        ok := EXISTS (SELECT 1 FROM public.broker_portal_tokens t
                       WHERE t.token = p_credencial AND t.is_active AND t.expires_at > now()
                         AND t.broker_id = s.broker_id);
    ELSIF p_canal = 'LINK' THEN
        ok := p_credencial IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.assinatura_segredos g
                 WHERE g.signatario_id = s.id
                   AND g.link_hash = encode(extensions.digest(p_credencial, 'sha256'), 'hex'));
    ELSIF p_canal = 'MEMBRO' THEN
        ok := p_user IS NOT NULL AND s.user_id = p_user
              AND EXISTS (SELECT 1 FROM public.organization_members m
                           WHERE m.user_id = p_user AND m.organization_id = s.organization_id);
    END IF;

    IF NOT ok THEN
        RAISE EXCEPTION 'assinatura não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;
    RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public._assinatura_autorizar(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. Máquina de estados (só a Edge `assinatura-interna`, via service_role) ─

-- 6.1 Criar. A Edge já congelou o PDF em assinaturas/<org>/<id>/original.pdf e
-- calculou o SHA-256; aqui se decide QUEM assina, com identidade do CADASTRO.
-- p_signatarios: [{canal, client_id|user_id|broker_id} | {canal:'LINK', nome, email, cpf}]
-- Devolve {envelope_id, signatarios:[{id, canal, papel, nome, email, link_token?}]}.
CREATE OR REPLACE FUNCTION public.assinatura_criar(
    p_envelope_id uuid, p_origem_tipo text, p_origem_id uuid, p_titulo text,
    p_original_path text, p_original_sha256 text, p_paginas int,
    p_signatarios jsonb, p_criado_por uuid, p_expira_dias int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org       uuid;
    v_contrato  uuid;
    v_deal      uuid;
    v_cdv       public.contract_document_versions;
    v_cdd       public.commercial_deal_documents;
    v_item      jsonb;
    v_canal     text;
    v_papel     text;
    v_nome      text;
    v_email     text;
    v_cpf       text;
    v_repr      text;
    v_doc       text;
    v_cli       public.clients;
    v_brk       public.broker_profiles;
    v_sig_id    uuid;
    v_token     text;
    v_saida     jsonb := '[]'::jsonb;
    v_ordem     int := 0;
    v_partes    int := 0;
BEGIN
    -- Origem → organização, contrato e negociação lidos DA LINHA.
    IF p_origem_tipo = 'CDV' THEN
        SELECT * INTO v_cdv FROM public.contract_document_versions WHERE id = p_origem_id;
        IF v_cdv.id IS NULL THEN
            RAISE EXCEPTION 'Versão do documento não encontrada' USING ERRCODE = '42501';
        END IF;
        SELECT coalesce(v_cdv.organization_id, c.organization_id), c.id, c.deal_id
          INTO v_org, v_contrato, v_deal
          FROM public.contracts c WHERE c.id = v_cdv.contract_id;
        IF v_cdv.signature_status = 'SIGNED' THEN
            RAISE EXCEPTION 'Esta versão já está assinada' USING ERRCODE = '22023';
        END IF;
        IF v_cdv.signature_token IS NOT NULL AND v_cdv.signature_status IN ('PENDING','SENT') THEN
            RAISE EXCEPTION 'Esta versão já foi enviada ao ZapSign' USING ERRCODE = '22023';
        END IF;
    ELSIF p_origem_tipo = 'DEAL_DOC' THEN
        SELECT * INTO v_cdd FROM public.commercial_deal_documents WHERE id = p_origem_id;
        IF v_cdd.id IS NULL THEN
            RAISE EXCEPTION 'Documento da negociação não encontrado' USING ERRCODE = '42501';
        END IF;
        IF v_cdd.signature_status = 'SIGNED' THEN
            RAISE EXCEPTION 'Este documento já está assinado' USING ERRCODE = '22023';
        END IF;
        v_org := v_cdd.organization_id;
        v_deal := v_cdd.deal_id;
        SELECT c.id INTO v_contrato FROM public.contracts c WHERE c.deal_id = v_deal ORDER BY c.created_at DESC LIMIT 1;
    ELSE
        RAISE EXCEPTION 'origem inválida' USING ERRCODE = '22023';
    END IF;

    IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members m
                                     WHERE m.user_id = p_criado_por AND m.organization_id = v_org) THEN
        RAISE EXCEPTION 'Sem permissão nesta organização' USING ERRCODE = '42501';
    END IF;
    IF p_original_path IS DISTINCT FROM (v_org::text || '/' || p_envelope_id::text || '/original.pdf') THEN
        RAISE EXCEPTION 'caminho do original inválido' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_signatarios) <> 'array' OR jsonb_array_length(p_signatarios) = 0 THEN
        RAISE EXCEPTION 'Informe ao menos um signatário' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_signatarios) > 12 THEN
        RAISE EXCEPTION 'No máximo 12 signatários por documento' USING ERRCODE = '22023';
    END IF;

    BEGIN
        INSERT INTO public.assinatura_envelopes (id, organization_id, origem_tipo, origem_id, contract_id, deal_id,
                                                 titulo, expira_em, original_path, original_sha256, paginas, criado_por)
        VALUES (p_envelope_id, v_org, p_origem_tipo, p_origem_id, v_contrato, v_deal,
                left(btrim(p_titulo), 200), now() + make_interval(days => greatest(1, least(coalesce(p_expira_dias, 30), 90))),
                p_original_path, lower(p_original_sha256), p_paginas, p_criado_por);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Este documento já tem uma assinatura em andamento — cancele-a antes de enviar de novo'
            USING ERRCODE = '22023';
    END;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_signatarios) LOOP
        v_canal := v_item->>'canal';
        v_repr := NULL;
        v_ordem := v_ordem + 1;

        IF v_canal = 'PORTAL_CLIENTE' THEN
            v_papel := 'PARTE';
            SELECT * INTO v_cli FROM public.clients WHERE id = (v_item->>'client_id')::uuid;
            IF v_cli.id IS NULL
               OR NOT (
                    EXISTS (SELECT 1 FROM public.commercial_deal_buyers b WHERE b.deal_id = v_deal AND b.client_id = v_cli.id)
                 OR EXISTS (SELECT 1 FROM public.commercial_deals d WHERE d.id = v_deal AND d.client_id = v_cli.id)
                 OR EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = v_contrato AND c.client_id = v_cli.id)
               ) THEN
                RAISE EXCEPTION 'Cliente não é parte deste documento' USING ERRCODE = '42501';
            END IF;
            v_doc := regexp_replace(coalesce(v_cli.document, ''), '\D', '', 'g');
            IF length(v_doc) = 14 THEN
                -- Pessoa jurídica: quem assina é o representante legal, em nome dela.
                v_nome := nullif(btrim(v_cli.legal_rep_name), '');
                v_cpf := regexp_replace(coalesce(v_cli.legal_rep_document, ''), '\D', '', 'g');
                v_repr := v_cli.name;
                IF v_nome IS NULL THEN
                    RAISE EXCEPTION '% é pessoa jurídica e não tem representante legal no cadastro', v_cli.name USING ERRCODE = '22023';
                END IF;
            ELSE
                v_nome := v_cli.name;
                v_cpf := v_doc;
            END IF;
            v_email := lower(btrim(coalesce(v_cli.email, '')));
            v_partes := v_partes + 1;
        ELSIF v_canal = 'MEMBRO' THEN
            v_papel := 'REPRESENTANTE';
            SELECT nullif(btrim(m.name), ''), lower(btrim(coalesce(m.email, '')))
              INTO v_nome, v_email
              FROM public.organization_members m
             WHERE m.user_id = (v_item->>'user_id')::uuid AND m.organization_id = v_org
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Representante não é membro desta organização' USING ERRCODE = '42501';
            END IF;
            -- CPF do usuário mora no RH (employees.user_id); sem cadastro lá, vale o
            -- informado no envio — o representante o confirma ao assinar.
            SELECT regexp_replace(coalesce(em.cpf, ''), '\D', '', 'g') INTO v_cpf
              FROM public.employees em
             WHERE em.user_id = (v_item->>'user_id')::uuid
               AND public._assinatura_cpf_valido(regexp_replace(coalesce(em.cpf, ''), '\D', '', 'g'))
             LIMIT 1;   -- a pessoa é a mesma em qualquer cadastro do RH
            IF v_cpf IS NULL THEN
                v_cpf := regexp_replace(coalesce(v_item->>'cpf', ''), '\D', '', 'g');
            END IF;
            v_nome := coalesce(v_nome, split_part(v_email, '@', 1));
            SELECT o.name INTO v_repr FROM public.organizations o WHERE o.id = v_org;
        ELSIF v_canal = 'PORTAL_CORRETOR' THEN
            v_papel := 'CORRETOR';
            SELECT * INTO v_brk FROM public.broker_profiles bp
             WHERE bp.id = (v_item->>'broker_id')::uuid
               AND EXISTS (SELECT 1 FROM public.commercial_deals d WHERE d.id = v_deal AND d.broker_id = bp.id);
            IF v_brk.id IS NULL THEN
                RAISE EXCEPTION 'Corretor não é o desta negociação' USING ERRCODE = '42501';
            END IF;
            v_nome := v_brk.name;
            v_email := lower(btrim(coalesce(v_brk.email, '')));
            v_cpf := regexp_replace(coalesce(v_brk.cpf, ''), '\D', '', 'g');
        ELSIF v_canal = 'LINK' THEN
            v_papel := 'TESTEMUNHA';
            v_nome := nullif(btrim(v_item->>'nome'), '');
            v_email := lower(btrim(coalesce(v_item->>'email', '')));
            v_cpf := regexp_replace(coalesce(v_item->>'cpf', ''), '\D', '', 'g');
            IF v_nome IS NULL THEN
                RAISE EXCEPTION 'Informe o nome da testemunha' USING ERRCODE = '22023';
            END IF;
        ELSE
            RAISE EXCEPTION 'canal de signatário inválido' USING ERRCODE = '22023';
        END IF;

        IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RAISE EXCEPTION '% não tem e-mail válido no cadastro', coalesce(v_nome, 'Signatário') USING ERRCODE = '22023';
        END IF;
        IF NOT public._assinatura_cpf_valido(v_cpf) THEN
            RAISE EXCEPTION '% não tem CPF válido no cadastro', coalesce(v_nome, 'Signatário') USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.assinatura_signatarios (envelope_id, organization_id, ordem, papel, canal,
                                                   client_id, user_id, broker_id, nome, representa, email, cpf)
        VALUES (p_envelope_id, v_org, v_ordem, v_papel, v_canal,
                CASE WHEN v_canal = 'PORTAL_CLIENTE' THEN v_cli.id END,
                CASE WHEN v_canal = 'MEMBRO' THEN (v_item->>'user_id')::uuid END,
                CASE WHEN v_canal = 'PORTAL_CORRETOR' THEN v_brk.id END,
                left(v_nome, 200), left(v_repr, 200), v_email, v_cpf)
        RETURNING id INTO v_sig_id;

        v_token := NULL;
        IF v_canal = 'LINK' THEN
            v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\n', '-_'), '=');
        END IF;
        INSERT INTO public.assinatura_segredos (signatario_id, link_hash)
        VALUES (v_sig_id, CASE WHEN v_token IS NOT NULL THEN encode(extensions.digest(v_token, 'sha256'), 'hex') END);

        v_saida := v_saida || jsonb_build_object(
            'id', v_sig_id, 'canal', v_canal, 'papel', v_papel, 'nome', v_nome, 'email', v_email,
            'client_id', CASE WHEN v_canal = 'PORTAL_CLIENTE' THEN v_cli.id END,
            'broker_id', CASE WHEN v_canal = 'PORTAL_CORRETOR' THEN v_brk.id END,
            'link_token', v_token);
    END LOOP;

    IF v_partes = 0 THEN
        RAISE EXCEPTION 'O documento precisa de ao menos um comprador/cliente como signatário' USING ERRCODE = '22023';
    END IF;

    PERFORM public._assinatura_evento(p_envelope_id, NULL, 'CRIADO',
        jsonb_build_object('titulo', p_titulo, 'original_sha256', lower(p_original_sha256), 'paginas', p_paginas,
                           'criado_por', p_criado_por,
                           'signatarios', (SELECT jsonb_agg(jsonb_build_object('id', x->>'id', 'papel', x->>'papel', 'nome', x->>'nome'))
                                             FROM jsonb_array_elements(v_saida) x)),
        NULL, NULL);
    PERFORM public._assinatura_projetar(p_envelope_id, 'SENT');

    RETURN jsonb_build_object('envelope_id', p_envelope_id, 'organization_id', v_org, 'signatarios', v_saida);
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_criar(uuid, text, uuid, text, text, text, int, jsonb, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_criar(uuid, text, uuid, text, text, text, int, jsonb, uuid, int) TO service_role;

-- 6.2 Ver: autoriza, registra a 1ª visualização, devolve o que a Edge precisa
-- (inclusive o caminho — a Edge nunca o repassa ao navegador).
CREATE OR REPLACE FUNCTION public.assinatura_ver(
    p_signatario uuid, p_canal text, p_credencial text, p_user uuid, p_ip text, p_ua text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    s public.assinatura_signatarios;
    e public.assinatura_envelopes;
BEGIN
    s := public._assinatura_autorizar(p_signatario, p_canal, p_credencial, p_user);
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = s.envelope_id FOR UPDATE;
    PERFORM public._assinatura_vencer(e.id);
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = s.envelope_id;

    IF s.visualizou_em IS NULL AND s.status = 'PENDENTE' AND e.status = 'ENVIADO' THEN
        UPDATE public.assinatura_signatarios SET visualizou_em = now() WHERE id = s.id;
        PERFORM public._assinatura_evento(e.id, s.id, 'VISUALIZOU', '{}'::jsonb, p_ip, p_ua);
    END IF;

    RETURN jsonb_build_object(
        'envelope_id', e.id, 'titulo', e.titulo, 'status', e.status, 'expira_em', e.expira_em,
        'original_path', e.original_path, 'original_sha256', e.original_sha256,
        'final_path', e.final_path, 'paginas', e.paginas,
        'emitente', (SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id),
        'signatario', jsonb_build_object('id', s.id, 'nome', s.nome, 'papel', s.papel, 'representa', s.representa,
                                         'status', s.status, 'assinado_em', s.assinado_em,
                                         'email_mascarado', regexp_replace(s.email, '^(.).*(@.*)$', '\1***\2')),
        'signatarios', (SELECT jsonb_agg(jsonb_build_object('nome', x.nome, 'papel', x.papel, 'status', x.status,
                                                            'assinado_em', x.assinado_em) ORDER BY x.ordem)
                          FROM public.assinatura_signatarios x WHERE x.envelope_id = e.id));
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_ver(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_ver(uuid, text, text, uuid, text, text) TO service_role;

-- 6.3 Registrar código: limite de envio e bloqueio; guarda só o hash.
-- A Edge gera o código e o manda ao e-mail devolvido aqui.
CREATE OR REPLACE FUNCTION public.assinatura_registrar_codigo(
    p_signatario uuid, p_canal text, p_credencial text, p_user uuid,
    p_otp_hash text, p_ip text, p_ua text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    s public.assinatura_signatarios;
    e public.assinatura_envelopes;
    g public.assinatura_segredos;
BEGIN
    s := public._assinatura_autorizar(p_signatario, p_canal, p_credencial, p_user);
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = s.envelope_id FOR UPDATE;
    IF public._assinatura_vencer(e.id) THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'O prazo para assinar este documento venceu.');
    END IF;
    IF e.status <> 'ENVIADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Este documento não está mais aguardando assinatura.');
    END IF;
    IF s.status = 'ASSINADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Você já assinou este documento.');
    END IF;
    IF p_otp_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'hash inválido' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO g FROM public.assinatura_segredos WHERE signatario_id = s.id FOR UPDATE;
    IF g.bloqueado_ate IS NOT NULL AND g.bloqueado_ate > now() THEN
        RAISE EXCEPTION 'Muitas tentativas. Tente de novo depois de %.', to_char(g.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
            USING ERRCODE = '54000';
    END IF;
    IF EXISTS (SELECT 1 FROM public.assinatura_eventos v
                WHERE v.signatario_id = s.id AND v.tipo = 'CODIGO_ENVIADO' AND v.criado_em > now() - interval '60 seconds') THEN
        RAISE EXCEPTION 'Aguarde um minuto para pedir outro código.' USING ERRCODE = '54000';
    END IF;
    IF (SELECT count(*) FROM public.assinatura_eventos v
         WHERE v.signatario_id = s.id AND v.tipo = 'CODIGO_ENVIADO' AND v.criado_em > now() - interval '1 hour') >= 5 THEN
        RAISE EXCEPTION 'Limite de códigos por hora atingido. Tente de novo mais tarde.' USING ERRCODE = '54000';
    END IF;

    UPDATE public.assinatura_segredos
       SET otp_hash = p_otp_hash, otp_expira_em = now() + interval '10 minutes', otp_tentativas = 0
     WHERE signatario_id = s.id;
    PERFORM public._assinatura_evento(e.id, s.id, 'CODIGO_ENVIADO',
        jsonb_build_object('para', regexp_replace(s.email, '^(.).*(@.*)$', '\1***\2')), p_ip, p_ua);

    RETURN jsonb_build_object('ok', true, 'email', s.email, 'nome', s.nome, 'titulo', e.titulo,
                              'email_mascarado', regexp_replace(s.email, '^(.).*(@.*)$', '\1***\2'));
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_registrar_codigo(uuid, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_registrar_codigo(uuid, text, text, uuid, text, text, text) TO service_role;

-- 6.4 Confirmar: código + CPF + aceite. Erro de negócio NÃO levanta exceção
-- (senão a tentativa contada seria desfeita): volta {ok:false}.
-- p_otp_hash = sha256(signatario_id || ':' || codigo), calculado na Edge.
CREATE OR REPLACE FUNCTION public.assinatura_confirmar(
    p_signatario uuid, p_canal text, p_credencial text, p_user uuid,
    p_otp_hash text, p_cpf text, p_aceite boolean, p_termo_versao text, p_ip text, p_ua text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    s        public.assinatura_signatarios;
    e        public.assinatura_envelopes;
    g        public.assinatura_segredos;
    v_falta  int;
    v_esgot  int;
BEGIN
    s := public._assinatura_autorizar(p_signatario, p_canal, p_credencial, p_user);
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = s.envelope_id FOR UPDATE;
    IF public._assinatura_vencer(e.id) THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'O prazo para assinar este documento venceu.');
    END IF;
    IF e.status <> 'ENVIADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Este documento não está mais aguardando assinatura.');
    END IF;
    -- Relê sob a trava do envelope (outra chamada pode ter assinado antes).
    SELECT * INTO s FROM public.assinatura_signatarios WHERE id = s.id;
    IF s.status = 'ASSINADO' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Você já assinou este documento.');
    END IF;
    IF p_aceite IS NOT TRUE OR coalesce(btrim(p_termo_versao), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Marque a declaração de aceite para assinar.');
    END IF;

    SELECT * INTO g FROM public.assinatura_segredos WHERE signatario_id = s.id FOR UPDATE;
    IF g.bloqueado_ate IS NOT NULL AND g.bloqueado_ate > now() THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Tente de novo mais tarde.', 'bloqueado', true);
    END IF;
    IF g.otp_hash IS NULL OR g.otp_expira_em IS NULL OR g.otp_expira_em < now() THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Código vencido ou não pedido. Peça um novo código.', 'pedir_codigo', true);
    END IF;

    IF g.otp_hash IS DISTINCT FROM lower(p_otp_hash)
       OR s.cpf IS DISTINCT FROM regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') THEN
        UPDATE public.assinatura_segredos SET otp_tentativas = otp_tentativas + 1
         WHERE signatario_id = s.id RETURNING * INTO g;
        PERFORM public._assinatura_evento(e.id, s.id, 'CONFIRMACAO_RECUSADA',
            jsonb_build_object('tentativa', g.otp_tentativas), p_ip, p_ua);
        IF g.otp_tentativas >= 5 THEN
            UPDATE public.assinatura_segredos SET otp_hash = NULL, otp_expira_em = NULL WHERE signatario_id = s.id;
            PERFORM public._assinatura_evento(e.id, s.id, 'CODIGO_ESGOTADO', '{}'::jsonb, p_ip, p_ua);
            SELECT count(*) INTO v_esgot FROM public.assinatura_eventos v
             WHERE v.signatario_id = s.id AND v.tipo = 'CODIGO_ESGOTADO' AND v.criado_em > now() - interval '24 hours';
            IF v_esgot >= 3 THEN
                UPDATE public.assinatura_segredos SET bloqueado_ate = now() + interval '24 hours' WHERE signatario_id = s.id;
                PERFORM public._assinatura_evento(e.id, s.id, 'BLOQUEADO', '{"horas":24}'::jsonb, p_ip, p_ua);
            END IF;
            RETURN jsonb_build_object('ok', false, 'erro', 'Código ou CPF não confere. O código foi invalidado — peça um novo.', 'pedir_codigo', true);
        END IF;
        RETURN jsonb_build_object('ok', false, 'erro', 'Código ou CPF não confere.');
    END IF;

    UPDATE public.assinatura_signatarios
       SET status = 'ASSINADO', assinado_em = now(), ip = left(p_ip, 100), user_agent = left(p_ua, 500),
           termo_versao = left(p_termo_versao, 40),
           visualizou_em = coalesce(visualizou_em, now())
     WHERE id = s.id;
    UPDATE public.assinatura_segredos SET otp_hash = NULL, otp_expira_em = NULL, otp_tentativas = 0
     WHERE signatario_id = s.id;
    PERFORM public._assinatura_evento(e.id, s.id, 'ASSINOU',
        jsonb_build_object('cpf', public._assinatura_cpf_mascarado(s.cpf), 'termo_versao', p_termo_versao,
                           'original_sha256', e.original_sha256, 'aceite', true, 'canal', s.canal),
        p_ip, p_ua);

    SELECT count(*) INTO v_falta FROM public.assinatura_signatarios x
     WHERE x.envelope_id = e.id AND x.status <> 'ASSINADO';
    IF v_falta = 0 THEN
        UPDATE public.assinatura_envelopes SET status = 'FINALIZANDO' WHERE id = e.id;
        PERFORM public._assinatura_evento(e.id, NULL, 'TODOS_ASSINARAM', '{}'::jsonb, NULL, NULL);
    END IF;

    RETURN jsonb_build_object('ok', true, 'envelope_id', e.id, 'finalizar', v_falta = 0, 'faltam', v_falta);
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text) TO service_role;

-- 6.5 Concluir: a Edge carimbou o PDF final. Só de FINALIZANDO para CONCLUIDO;
-- chamada repetida no CONCLUIDO devolve o que já está (idempotente).
CREATE OR REPLACE FUNCTION public.assinatura_concluir(p_envelope uuid, p_final_path text, p_final_sha256 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e public.assinatura_envelopes;
BEGIN
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = p_envelope FOR UPDATE;
    IF e.id IS NULL THEN
        RAISE EXCEPTION 'envelope não encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF e.status = 'CONCLUIDO' THEN
        RETURN jsonb_build_object('ok', true, 'ja_concluido', true, 'final_path', e.final_path, 'final_sha256', e.final_sha256);
    END IF;
    IF e.status <> 'FINALIZANDO' THEN
        RAISE EXCEPTION 'envelope não está finalizando (%)', e.status USING ERRCODE = '22023';
    END IF;
    IF p_final_path IS DISTINCT FROM (e.organization_id::text || '/' || e.id::text || '/final.pdf')
       OR p_final_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'arquivo final inválido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assinatura_envelopes
       SET status = 'CONCLUIDO', final_path = p_final_path, final_sha256 = p_final_sha256, concluido_em = now()
     WHERE id = e.id;
    PERFORM public._assinatura_evento(e.id, NULL, 'CONCLUIDO', jsonb_build_object('final_sha256', p_final_sha256), NULL, NULL);
    RETURN jsonb_build_object('ok', true, 'ja_concluido', false, 'final_path', p_final_path, 'final_sha256', p_final_sha256);
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_concluir(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_concluir(uuid, text, text) TO service_role;

-- 6.6 Cancelar: membro da org do envelope; só enquanto ENVIADO.
CREATE OR REPLACE FUNCTION public.assinatura_cancelar(p_envelope uuid, p_user uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e public.assinatura_envelopes;
BEGIN
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = p_envelope FOR UPDATE;
    IF e.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members m
                                    WHERE m.user_id = p_user AND m.organization_id = e.organization_id) THEN
        RAISE EXCEPTION 'envelope não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    IF public._assinatura_vencer(e.id) THEN
        RETURN jsonb_build_object('ok', true, 'status', 'EXPIRADO');
    END IF;
    IF e.status <> 'ENVIADO' THEN
        RAISE EXCEPTION 'Só se cancela assinatura em andamento (está %)', e.status USING ERRCODE = '22023';
    END IF;
    UPDATE public.assinatura_envelopes
       SET status = 'CANCELADO', cancelado_por = p_user, cancelado_em = now(),
           motivo = coalesce(nullif(btrim(p_motivo), ''), 'Cancelado por quem enviou')
     WHERE id = e.id;
    PERFORM public._assinatura_evento(e.id, NULL, 'CANCELADO',
        jsonb_build_object('por', p_user, 'motivo', p_motivo), NULL, NULL);
    PERFORM public._assinatura_projetar(e.id, 'CANCELLED');
    RETURN jsonb_build_object('ok', true, 'status', 'CANCELADO');
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_cancelar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_cancelar(uuid, uuid, text) TO service_role;

-- ── 7. Versão nova cancela o envelope ativo do documento anterior ───────────
CREATE OR REPLACE FUNCTION public._assinatura_cancelar_por_nova_versao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r record;
BEGIN
    IF TG_TABLE_NAME = 'contract_document_versions' THEN
        FOR r IN
            SELECT e.id FROM public.assinatura_envelopes e
              JOIN public.contract_document_versions v ON v.id = e.origem_id
             WHERE e.origem_tipo = 'CDV' AND e.status = 'ENVIADO'
               AND v.owner_type = NEW.owner_type AND v.owner_id = NEW.owner_id AND v.kind = NEW.kind
               AND v.id <> NEW.id
             FOR UPDATE OF e
        LOOP
            UPDATE public.assinatura_envelopes
               SET status = 'CANCELADO', cancelado_em = now(), motivo = 'Nova versão do documento'
             WHERE id = r.id;
            PERFORM public._assinatura_evento(r.id, NULL, 'CANCELADO',
                jsonb_build_object('motivo', 'nova versão', 'nova_versao', NEW.id), NULL, NULL);
            PERFORM public._assinatura_projetar(r.id, 'CANCELLED');
        END LOOP;
    ELSE
        FOR r IN
            SELECT e.id FROM public.assinatura_envelopes e
              JOIN public.commercial_deal_documents d ON d.id = e.origem_id
             WHERE e.origem_tipo = 'DEAL_DOC' AND e.status = 'ENVIADO'
               AND d.deal_id = NEW.deal_id AND d.kind = NEW.kind AND d.id <> NEW.id
             FOR UPDATE OF e
        LOOP
            UPDATE public.assinatura_envelopes
               SET status = 'CANCELADO', cancelado_em = now(), motivo = 'Nova versão do documento'
             WHERE id = r.id;
            PERFORM public._assinatura_evento(r.id, NULL, 'CANCELADO',
                jsonb_build_object('motivo', 'nova versão', 'nova_versao', NEW.id), NULL, NULL);
            PERFORM public._assinatura_projetar(r.id, 'CANCELLED');
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._assinatura_cancelar_por_nova_versao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cdv_nova_versao_cancela_assinatura ON public.contract_document_versions;
CREATE TRIGGER trg_cdv_nova_versao_cancela_assinatura AFTER INSERT ON public.contract_document_versions
    FOR EACH ROW EXECUTE FUNCTION public._assinatura_cancelar_por_nova_versao();
DROP TRIGGER IF EXISTS trg_cdd_nova_versao_cancela_assinatura ON public.commercial_deal_documents;
CREATE TRIGGER trg_cdd_nova_versao_cancela_assinatura AFTER INSERT ON public.commercial_deal_documents
    FOR EACH ROW EXECUTE FUNCTION public._assinatura_cancelar_por_nova_versao();

-- Versão com envelope não se exclui (o serviço já recusa; isto é a trava).
CREATE OR REPLACE FUNCTION public.cdv_nao_apaga_assinado_no_portal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.assinatura_envelope_id IS NOT NULL THEN
        RAISE EXCEPTION 'Versão que foi enviada para assinatura não se exclui — ela é a prova do que foi assinado'
            USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.cdv_nao_apaga_assinado_no_portal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cdv_nao_apaga_assinado_no_portal ON public.contract_document_versions;
CREATE TRIGGER trg_cdv_nao_apaga_assinado_no_portal BEFORE DELETE ON public.contract_document_versions
    FOR EACH ROW EXECUTE FUNCTION public.cdv_nao_apaga_assinado_no_portal();

-- ── 8. Leituras dos portais (por token, como fn_portal_get_contracts) ───────
CREATE OR REPLACE FUNCTION public._assinatura_lista_json(p_filtro text, p_id uuid, p_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'signatario_id', s.id,
               'envelope_id',   e.id,
               'titulo',        e.titulo,
               'papel',         s.papel,
               'representa',    s.representa,
               'minha_situacao', s.status,
               'situacao',      CASE WHEN e.status = 'ENVIADO' AND e.expira_em < now() THEN 'EXPIRADO' ELSE e.status END,
               'enviado_em',    e.criado_em,
               'expira_em',     e.expira_em,
               'assinado_em',   s.assinado_em,
               'concluido_em',  e.concluido_em,
               'emitente',      o.name
           ) ORDER BY (s.status = 'PENDENTE' AND e.status = 'ENVIADO' AND e.expira_em >= now()) DESC, e.criado_em DESC), '[]'::jsonb)
      FROM public.assinatura_signatarios s
      JOIN public.assinatura_envelopes e ON e.id = s.envelope_id
      LEFT JOIN public.organizations o ON o.id = e.organization_id
     WHERE e.status <> 'CANCELADO'
       AND ((p_filtro = 'cliente' AND s.canal = 'PORTAL_CLIENTE' AND s.client_id = p_id AND s.organization_id = p_org)
         OR (p_filtro = 'corretor' AND s.canal = 'PORTAL_CORRETOR' AND s.broker_id = p_id))
$$;
REVOKE ALL ON FUNCTION public._assinatura_lista_json(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_assinaturas(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > now();
    IF v_tok.id IS NULL THEN
        RETURN jsonb_build_object('valid', false);
    END IF;
    RETURN jsonb_build_object('valid', true, 'itens', public._assinatura_lista_json('cliente', v_tok.client_id, v_tok.org_id));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_portal_assinaturas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_portal_assinaturas(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_broker_portal_assinaturas(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok public.broker_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.broker_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > now();
    IF v_tok.id IS NULL THEN
        RETURN jsonb_build_object('valid', false);
    END IF;
    RETURN jsonb_build_object('valid', true, 'itens', public._assinatura_lista_json('corretor', v_tok.broker_id, NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_broker_portal_assinaturas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_assinaturas(text) TO anon, authenticated, service_role;

-- ── 9. Validação pública (destino do QR do PDF) ─────────────────────────────
-- Recorte pelo id do envelope (UUID aleatório). Nunca devolve arquivo, caminho,
-- e-mail, IP nem CPF inteiro.
CREATE OR REPLACE FUNCTION public.assinatura_validar(p_envelope uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    e public.assinatura_envelopes;
BEGIN
    SELECT * INTO e FROM public.assinatura_envelopes WHERE id = p_envelope;
    IF e.id IS NULL THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;
    RETURN jsonb_build_object(
        'encontrado',      true,
        'titulo',          e.titulo,
        'emitente',        (SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id),
        'situacao',        CASE WHEN e.status = 'ENVIADO' AND e.expira_em < now() THEN 'EXPIRADO' ELSE e.status END,
        'enviado_em',      e.criado_em,
        'concluido_em',    e.concluido_em,
        'paginas',         e.paginas,
        'original_sha256', e.original_sha256,
        'final_sha256',    e.final_sha256,
        'signatarios',     (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'nome', s.nome, 'papel', s.papel, 'representa', s.representa,
                                'cpf', public._assinatura_cpf_mascarado(s.cpf),
                                'situacao', s.status, 'assinado_em', s.assinado_em) ORDER BY s.ordem), '[]'::jsonb)
                              FROM public.assinatura_signatarios s WHERE s.envelope_id = e.id));
END;
$$;
REVOKE ALL ON FUNCTION public.assinatura_validar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinatura_validar(uuid) TO anon, authenticated, service_role;
