-- ============================================================
-- Sprint 16: eSocial — Gerador de Eventos S-1xxx / S-2xxx
-- ============================================================

-- 1. CONFIGURAÇÃO ESOCIAL POR ORG
CREATE TABLE IF NOT EXISTS public.esocial_config (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                 UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    ambiente               TEXT NOT NULL DEFAULT 'PRODUCAO_RESTRITA'
                               CHECK (ambiente IN ('PRODUCAO','PRODUCAO_RESTRITA')),
    versao_schema          TEXT NOT NULL DEFAULT 'S-1.2',
    -- Identificação do empregador
    tipo_inscricao         INTEGER NOT NULL DEFAULT 1 CHECK (tipo_inscricao IN (1,2)),  -- 1=CNPJ 2=CPF
    nr_inscricao           TEXT NOT NULL,
    -- Certificado digital (apenas referência; nunca armazenar bytes aqui)
    cert_serial            TEXT,
    cert_validade          DATE,
    cert_status            TEXT DEFAULT 'NAO_CONFIGURADO'
                               CHECK (cert_status IN ('NAO_CONFIGURADO','VALIDO','EXPIRADO','INVALIDO')),
    -- Transmissão
    transmissao_automatica BOOLEAN DEFAULT FALSE,
    horario_transmissao    TIME,
    ativo                  BOOLEAN DEFAULT FALSE,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EVENTOS ESOCIAL
CREATE TABLE IF NOT EXISTS public.esocial_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Tipo e grupo do evento (tabela MOS do eSocial)
    tipo_evento         TEXT NOT NULL,   -- ex: S-1000, S-2200, S-2206, S-2400
    grupo               TEXT NOT NULL
                            CHECK (grupo IN ('TABELAS','NAO_PERIODICOS','PERIODICOS','FECHAMENTO')),
    -- Referência à entidade que originou o evento
    entidade            TEXT,    -- 'employee', 'payroll_period', 'beneficio', etc.
    entidade_id         UUID,
    -- Competência (periódicos)
    per_apur            TEXT,    -- formato YYYY-MM
    -- Payload
    xml_gerado          TEXT,    -- XML assinado (pode ser grande; considerar Storage para prod)
    xml_hash            TEXT,
    -- Protocolo de transmissão
    protocolo           TEXT,
    recibo              TEXT,
    -- Ciclo de vida
    status              TEXT NOT NULL DEFAULT 'GERADO'
                            CHECK (status IN ('GERADO','ASSINADO','AGUARDANDO','PROCESSADO','ERRO','CANCELADO','EXCLUIDO')),
    retorno_codigo      TEXT,
    retorno_descricao   TEXT,
    -- Datas
    gerado_em           TIMESTAMPTZ DEFAULT NOW(),
    assinado_em         TIMESTAMPTZ,
    transmitido_em      TIMESTAMPTZ,
    processado_em       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esocial_ev_org      ON public.esocial_events(org_id);
CREATE INDEX IF NOT EXISTS idx_esocial_ev_tipo     ON public.esocial_events(org_id, tipo_evento);
CREATE INDEX IF NOT EXISTS idx_esocial_ev_status   ON public.esocial_events(org_id, status);
CREATE INDEX IF NOT EXISTS idx_esocial_ev_entidade ON public.esocial_events(entidade_id) WHERE entidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esocial_ev_per_apur ON public.esocial_events(org_id, per_apur) WHERE per_apur IS NOT NULL;

-- 3. LOTES DE TRANSMISSÃO
CREATE TABLE IF NOT EXISTS public.esocial_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    numero_lote         TEXT,
    grupo               TEXT NOT NULL
                            CHECK (grupo IN ('TABELAS','NAO_PERIODICOS','PERIODICOS','FECHAMENTO')),
    per_apur            TEXT,
    total_eventos       INTEGER DEFAULT 0,
    eventos_ok          INTEGER DEFAULT 0,
    eventos_erro        INTEGER DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'ABERTO'
                            CHECK (status IN ('ABERTO','TRANSMITINDO','AGUARDANDO','PROCESSADO','ERRO')),
    protocolo_envio     TEXT,
    retorno_codigo      TEXT,
    retorno_descricao   TEXT,
    transmitido_em      TIMESTAMPTZ,
    processado_em       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esocial_batch_org    ON public.esocial_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_esocial_batch_status ON public.esocial_batches(org_id, status);

-- 4. RELACIONAMENTO LOTE <-> EVENTOS
CREATE TABLE IF NOT EXISTS public.esocial_batch_events (
    batch_id UUID NOT NULL REFERENCES public.esocial_batches(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.esocial_events(id) ON DELETE CASCADE,
    PRIMARY KEY (batch_id, event_id)
);

-- 5. ALERTAS DE PENDÊNCIAS (UX helper)
CREATE TABLE IF NOT EXISTS public.esocial_pending_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tipo_evento  TEXT NOT NULL,
    titulo       TEXT NOT NULL,
    descricao    TEXT,
    entidade     TEXT,
    entidade_id  UUID,
    prioridade   TEXT NOT NULL DEFAULT 'NORMAL'
                     CHECK (prioridade IN ('CRITICA','ALTA','NORMAL','BAIXA')),
    prazo        DATE,
    resolvida    BOOLEAN DEFAULT FALSE,
    resolvida_em TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esocial_alerts_org    ON public.esocial_pending_alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_esocial_alerts_open   ON public.esocial_pending_alerts(org_id, resolvida) WHERE resolvida = FALSE;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.esocial_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esocial_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esocial_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esocial_batch_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esocial_pending_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esocial_config_org"   ON public.esocial_config         FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "esocial_events_org"   ON public.esocial_events         FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "esocial_batches_org"  ON public.esocial_batches        FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "esocial_batch_ev_org" ON public.esocial_batch_events   FOR ALL USING (
    EXISTS (SELECT 1 FROM public.esocial_batches b WHERE b.id = batch_id AND public.is_org_member(b.org_id))
);
CREATE POLICY "esocial_alerts_org"   ON public.esocial_pending_alerts FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER trg_esocial_config_updated_at
    BEFORE UPDATE ON public.esocial_config
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_esocial_events_updated_at
    BEFORE UPDATE ON public.esocial_events
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_esocial_batches_updated_at
    BEFORE UPDATE ON public.esocial_batches
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- RPC: Gerar evento S-2200 (Admissão de Trabalhador)
-- ============================================================
CREATE OR REPLACE FUNCTION public.esocial_generate_s2200(p_employee_id UUID)
RETURNS JSON AS $$
DECLARE
    v_emp      public.employees;
    v_event_id UUID;
BEGIN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Colaborador não encontrado'); END IF;

    IF EXISTS (
        SELECT 1 FROM public.esocial_events
        WHERE org_id = v_emp.org_id AND tipo_evento = 'S-2200'
          AND entidade = 'employee' AND entidade_id = p_employee_id
          AND status NOT IN ('CANCELADO','EXCLUIDO')
    ) THEN
        RETURN json_build_object('error', 'Evento S-2200 já existe para este colaborador — use S-2206 para alterações');
    END IF;

    INSERT INTO public.esocial_events (
        org_id, tipo_evento, grupo, entidade, entidade_id, status
    ) VALUES (
        v_emp.org_id, 'S-2200', 'NAO_PERIODICOS', 'employee', p_employee_id, 'GERADO'
    ) RETURNING id INTO v_event_id;

    RETURN json_build_object('success', TRUE, 'event_id', v_event_id, 'tipo_evento', 'S-2200');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.esocial_generate_s2200(UUID) TO authenticated;

-- ============================================================
-- RPC: Dashboard de status eSocial
-- ============================================================
CREATE OR REPLACE FUNCTION public.esocial_get_dashboard(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
    v_pendentes   INTEGER;
    v_erros       INTEGER;
    v_aguardando  INTEGER;
    v_processados INTEGER;
    v_alertas     INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pendentes  FROM public.esocial_events WHERE org_id = p_org_id AND status = 'GERADO';
    SELECT COUNT(*) INTO v_erros      FROM public.esocial_events WHERE org_id = p_org_id AND status = 'ERRO';
    SELECT COUNT(*) INTO v_aguardando FROM public.esocial_events WHERE org_id = p_org_id AND status = 'AGUARDANDO';
    SELECT COUNT(*) INTO v_processados FROM public.esocial_events
        WHERE org_id = p_org_id AND status = 'PROCESSADO'
          AND DATE_TRUNC('month', processado_em) = DATE_TRUNC('month', NOW());
    SELECT COUNT(*) INTO v_alertas FROM public.esocial_pending_alerts
        WHERE org_id = p_org_id AND resolvida = FALSE;

    RETURN json_build_object(
        'pendentes',    v_pendentes,
        'erros',        v_erros,
        'aguardando',   v_aguardando,
        'processados_mes', v_processados,
        'alertas_abertos', v_alertas
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.esocial_get_dashboard(UUID) TO authenticated;

-- ============================================================
-- RPC: Criar lote e associar eventos pendentes
-- ============================================================
CREATE OR REPLACE FUNCTION public.esocial_create_batch(
    p_org_id UUID,
    p_grupo  TEXT,
    p_per_apur TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_batch_id UUID;
    v_total    INTEGER := 0;
    v_ev       RECORD;
BEGIN
    INSERT INTO public.esocial_batches (org_id, grupo, per_apur)
    VALUES (p_org_id, p_grupo, p_per_apur)
    RETURNING id INTO v_batch_id;

    FOR v_ev IN
        SELECT id FROM public.esocial_events
        WHERE org_id = p_org_id AND grupo = p_grupo AND status = 'GERADO'
          AND (p_per_apur IS NULL OR per_apur = p_per_apur)
        ORDER BY gerado_em
        LIMIT 50   -- limite por lote conforme leiaute eSocial
    LOOP
        INSERT INTO public.esocial_batch_events (batch_id, event_id) VALUES (v_batch_id, v_ev.id);
        v_total := v_total + 1;
    END LOOP;

    UPDATE public.esocial_batches SET total_eventos = v_total WHERE id = v_batch_id;

    RETURN json_build_object('success', TRUE, 'batch_id', v_batch_id, 'total_eventos', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.esocial_create_batch(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- VIEW: Painel de eventos por tipo e status
-- ============================================================
CREATE OR REPLACE VIEW public.vw_esocial_status_panel AS
SELECT
    e.org_id,
    e.tipo_evento,
    e.grupo,
    e.status,
    COUNT(*)                                            AS total,
    MIN(e.gerado_em)                                    AS mais_antigo,
    MAX(e.gerado_em)                                    AS mais_recente,
    COUNT(*) FILTER (WHERE e.status = 'ERRO')           AS total_erros,
    COUNT(*) FILTER (WHERE e.status = 'PROCESSADO')     AS total_ok
FROM public.esocial_events e
GROUP BY e.org_id, e.tipo_evento, e.grupo, e.status;
