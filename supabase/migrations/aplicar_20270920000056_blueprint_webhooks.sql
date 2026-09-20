-- ============================================================================
-- Planta Inteligente — WEBHOOKS por organização (20/09/2026, E9.3)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 9.3: "`blueprint_webhooks` (org, evento: versão publicada/aprovada,
-- comentário, alternativa principal) disparados por database webhook do
-- Supabase; retentativa e log".
--
-- ─── DESENHO ────────────────────────────────────────────────────────────────
--
-- 1. `blueprint_webhooks`: a assinatura — URL https, segredo (HMAC-SHA256 do
--    corpo em `X-Opura-Signature`), eventos marcados, ativo. Configuração da
--    organização: RLS por `is_org_member`, como os templates de vista.
-- 2. `blueprint_webhook_entregas`: a FILA e o LOG — uma linha por (evento ×
--    webhook), com o payload congelado, tentativas, status http, erro e a
--    próxima tentativa. Membros LEEM; quem escreve é o banco (gatilhos) e a
--    Edge Function `planta-webhooks` (service_role).
-- 3. Gatilhos nas tabelas de origem chamam `fn_blueprint_webhook_enfileirar`,
--    que grava uma entrega por webhook ativo assinante e CUTUCA a function por
--    `net.http_post` (o "database webhook" do Supabase é exatamente pg_net num
--    gatilho). O disparo é assíncrono: a publicação nunca espera o destino.
-- 4. Retentativa: um job do pg_cron a cada minuto chama a mesma function, que
--    entrega o que está PENDENTE e vencido (1 min, 5 min, 30 min, 2 h, 12 h;
--    depois FALHOU). A function é o único lugar que fala com a internet.
-- 5. O gate da function é o `CRON_SECRET` da casa (`fn_cron_secret()`), não a
--    service_role key — REGRA #7.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Assinaturas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blueprint_webhooks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome              TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
    url               TEXT NOT NULL CHECK (url ~* '^https://' AND length(url) <= 2000),
    -- Segredo do HMAC. Gerado no banco; a tela mostra para a pessoa colar no receptor.
    segredo           TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
    eventos           TEXT[] NOT NULL DEFAULT ARRAY['versao.publicada'],
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultima_entrega_at TIMESTAMPTZ,
    ultimo_status     INTEGER,
    CONSTRAINT blueprint_webhooks_eventos_validos CHECK (
        eventos <@ ARRAY['versao.publicada', 'versao.aprovada', 'comentario.criado', 'alternativa.principal']::text[]
        AND cardinality(eventos) >= 1
    )
);

COMMENT ON TABLE public.blueprint_webhooks IS
  'Webhooks da Planta Inteligente por organização: URL https, segredo HMAC, eventos assinados. Entregas e retentativas em blueprint_webhook_entregas.';

CREATE INDEX IF NOT EXISTS blueprint_webhooks_org_idx ON public.blueprint_webhooks(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_webhooks_updated ON public.blueprint_webhooks;
CREATE TRIGGER trg_blueprint_webhooks_updated
    BEFORE UPDATE ON public.blueprint_webhooks
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_webhooks_org" ON public.blueprint_webhooks;
CREATE POLICY "blueprint_webhooks_org"
    ON public.blueprint_webhooks
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
REVOKE ALL ON public.blueprint_webhooks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_webhooks TO authenticated;

-- ── 2. Fila + log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blueprint_webhook_entregas (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id           UUID NOT NULL REFERENCES public.blueprint_webhooks(id) ON DELETE CASCADE,
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    evento               TEXT NOT NULL,
    payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
    status               TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENTREGUE', 'FALHOU')),
    tentativas           INTEGER NOT NULL DEFAULT 0,
    http_status          INTEGER,
    erro                 TEXT,
    proxima_tentativa_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entregue_at          TIMESTAMPTZ
);

COMMENT ON TABLE public.blueprint_webhook_entregas IS
  'Fila e log das entregas de webhook da Planta Inteligente: payload congelado, tentativas, status http, erro, próxima tentativa.';

CREATE INDEX IF NOT EXISTS blueprint_webhook_entregas_pendentes_idx
    ON public.blueprint_webhook_entregas(proxima_tentativa_at) WHERE status = 'PENDENTE';
CREATE INDEX IF NOT EXISTS blueprint_webhook_entregas_webhook_idx
    ON public.blueprint_webhook_entregas(webhook_id, created_at DESC);

ALTER TABLE public.blueprint_webhook_entregas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_webhook_entregas_org_select" ON public.blueprint_webhook_entregas;
CREATE POLICY "blueprint_webhook_entregas_org_select"
    ON public.blueprint_webhook_entregas
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));
REVOKE ALL ON public.blueprint_webhook_entregas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blueprint_webhook_entregas TO authenticated;

-- ── 3. Cutucar a function (pg_net) ──────────────────────────────────────────
-- Best effort: se o pg_net falhar, o cron do minuto seguinte entrega.
CREATE OR REPLACE FUNCTION public.fn_blueprint_webhook_cutucar()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
BEGIN
    PERFORM net.http_post(
        url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/planta-webhooks',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.fn_cron_secret()),
        body    := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'planta-webhooks: cutucada falhou (%); o cron entrega no próximo minuto', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_blueprint_webhook_cutucar() FROM PUBLIC, anon, authenticated;

-- ── 4. Enfileirar um evento para os webhooks assinantes da organização ──────
CREATE OR REPLACE FUNCTION public.fn_blueprint_webhook_enfileirar(p_organization_id UUID, p_evento TEXT, p_payload JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    INSERT INTO public.blueprint_webhook_entregas (webhook_id, organization_id, evento, payload)
    SELECT w.id, w.organization_id, p_evento, p_payload
      FROM public.blueprint_webhooks w
     WHERE w.organization_id = p_organization_id
       AND w.active
       AND (p_evento = 'teste.ping' OR p_evento = ANY (w.eventos));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
        PERFORM public.fn_blueprint_webhook_cutucar();
    END IF;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_blueprint_webhook_enfileirar(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ── 5. Gatilhos nas origens ─────────────────────────────────────────────────
-- Versão publicada.
CREATE OR REPLACE FUNCTION public.fn_blueprint_webhook_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estudo TEXT;
BEGIN
    SELECT s.name INTO v_estudo FROM public.blueprint_studies s WHERE s.id = NEW.study_id;
    IF TG_OP = 'INSERT' THEN
        PERFORM public.fn_blueprint_webhook_enfileirar(NEW.organization_id, 'versao.publicada', jsonb_build_object(
            'estudo_id', NEW.study_id, 'estudo', v_estudo, 'revisao', NEW.revision, 'hash', NEW.hash,
            'kernel', NEW.kernel_version, 'ramo_id', NEW.branch_id, 'publicada_em', NEW.published_at, 'notas', NEW.notes));
    ELSIF TG_OP = 'UPDATE' AND NEW.approval_status = 'APROVADO' AND OLD.approval_status IS DISTINCT FROM 'APROVADO' THEN
        PERFORM public.fn_blueprint_webhook_enfileirar(NEW.organization_id, 'versao.aprovada', jsonb_build_object(
            'estudo_id', NEW.study_id, 'estudo', v_estudo, 'revisao', NEW.revision, 'hash', NEW.hash,
            'kernel', NEW.kernel_version, 'ramo_id', NEW.branch_id, 'aprovada_em', now()));
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- O webhook é acessório: nunca derruba a operação que o originou.
    RAISE WARNING 'planta-webhooks: gatilho falhou (%)', SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_blueprint_webhook_snapshot ON public.blueprint_snapshots;
CREATE TRIGGER trg_blueprint_webhook_snapshot
    AFTER INSERT OR UPDATE OF approval_status ON public.blueprint_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_webhook_snapshot();

-- Comentário novo.
CREATE OR REPLACE FUNCTION public.fn_blueprint_webhook_comentario()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estudo TEXT;
BEGIN
    SELECT s.name INTO v_estudo FROM public.blueprint_studies s WHERE s.id = NEW.study_id;
    PERFORM public.fn_blueprint_webhook_enfileirar(NEW.organization_id, 'comentario.criado', jsonb_build_object(
        'estudo_id', NEW.study_id, 'estudo', v_estudo, 'comentario_id', NEW.id, 'autor', NEW.autor_email,
        'texto', left(NEW.texto, 500), 'elemento_uid', NEW.element_uid, 'snapshot_id', NEW.snapshot_id, 'criado_em', NEW.created_at));
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- O webhook é acessório: nunca derruba a operação que o originou.
    RAISE WARNING 'planta-webhooks: gatilho falhou (%)', SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_blueprint_webhook_comentario ON public.blueprint_comments;
CREATE TRIGGER trg_blueprint_webhook_comentario
    AFTER INSERT ON public.blueprint_comments
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_webhook_comentario();

-- Alternativa tornada principal.
CREATE OR REPLACE FUNCTION public.fn_blueprint_webhook_ramo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estudo TEXT;
BEGIN
    IF NEW.principal AND NOT COALESCE(OLD.principal, FALSE) THEN
        SELECT s.name INTO v_estudo FROM public.blueprint_studies s WHERE s.id = NEW.study_id;
        PERFORM public.fn_blueprint_webhook_enfileirar(NEW.organization_id, 'alternativa.principal', jsonb_build_object(
            'estudo_id', NEW.study_id, 'estudo', v_estudo, 'ramo_id', NEW.id, 'ramo', NEW.name, 'descricao', NEW.descricao));
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- O webhook é acessório: nunca derruba a operação que o originou.
    RAISE WARNING 'planta-webhooks: gatilho falhou (%)', SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_blueprint_webhook_ramo ON public.blueprint_branches;
CREATE TRIGGER trg_blueprint_webhook_ramo
    AFTER UPDATE OF principal ON public.blueprint_branches
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_webhook_ramo();

-- ── 6. Testar e reenviar (autenticado, membro da organização) ───────────────
CREATE OR REPLACE FUNCTION public.blueprint_webhook_testar(p_webhook_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501'; END IF;
    SELECT w.organization_id INTO v_org FROM public.blueprint_webhooks w WHERE w.id = p_webhook_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'webhook inexistente' USING ERRCODE = '22023'; END IF;
    IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'você não é membro desta organização' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.blueprint_webhook_entregas (webhook_id, organization_id, evento, payload)
    VALUES (p_webhook_id, v_org, 'teste.ping', jsonb_build_object('mensagem', 'Teste enviado pela tela Planta › Colaborar › Webhooks', 'por', auth.uid(), 'em', now()))
    RETURNING id INTO v_id;
    PERFORM public.fn_blueprint_webhook_cutucar();
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.blueprint_webhook_reenviar(p_entrega_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501'; END IF;
    SELECT e.organization_id INTO v_org FROM public.blueprint_webhook_entregas e WHERE e.id = p_entrega_id;
    IF v_org IS NULL THEN RETURN FALSE; END IF;
    IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'você não é membro desta organização' USING ERRCODE = '42501'; END IF;
    UPDATE public.blueprint_webhook_entregas
       SET status = 'PENDENTE', proxima_tentativa_at = now(), erro = NULL
     WHERE id = p_entrega_id AND status <> 'PENDENTE';
    IF FOUND THEN PERFORM public.fn_blueprint_webhook_cutucar(); END IF;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.blueprint_webhook_testar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blueprint_webhook_testar(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.blueprint_webhook_reenviar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blueprint_webhook_reenviar(UUID) TO authenticated;

-- ── 7. Retentativa: a function a cada minuto ────────────────────────────────
-- Idempotente: reagenda se já existir.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'planta-webhooks-retentativas') THEN
        PERFORM cron.unschedule('planta-webhooks-retentativas');
    END IF;
    PERFORM cron.schedule(
        'planta-webhooks-retentativas',
        '* * * * *',
        -- Só cutuca quando há entrega vencida: sem fila, sem chamada.
        $cron$SELECT public.fn_blueprint_webhook_cutucar() WHERE EXISTS (SELECT 1 FROM public.blueprint_webhook_entregas e WHERE e.status = 'PENDENTE' AND e.proxima_tentativa_at <= now());$cron$
    );
END $$;

-- ── 8. Regra da casa: SECURITY DEFINER sem EXECUTE para o público ───────────
-- (Gatilhos não se chamam à mão, mas a trava de segurança lê o arquivo.)
REVOKE ALL ON FUNCTION public.fn_blueprint_webhook_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_blueprint_webhook_comentario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_blueprint_webhook_ramo() FROM PUBLIC, anon, authenticated;
