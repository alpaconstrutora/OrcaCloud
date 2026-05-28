-- ============================================================
-- Sprint 14: Comunicação Interna + WhatsApp
-- ============================================================

-- 1. COMUNICADOS (broadcasts por obra, departamento ou todos)
CREATE TABLE IF NOT EXISTS public.communications (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    titulo                   TEXT NOT NULL,
    conteudo                 TEXT NOT NULL,
    tipo                     TEXT NOT NULL DEFAULT 'AVISO'
                                 CHECK (tipo IN ('AVISO','DDS','TREINAMENTO','URGENTE','ANIVERSARIO')),
    -- Segmentação de destinatários
    scope                    TEXT NOT NULL DEFAULT 'TODOS'
                                 CHECK (scope IN ('TODOS','OBRA','DEPARTAMENTO','INDIVIDUAL')),
    scope_ids                UUID[] DEFAULT '{}',   -- project_ids ou employee_ids
    -- Canais de entrega
    canal_app                BOOLEAN DEFAULT TRUE,
    canal_whatsapp           BOOLEAN DEFAULT FALSE,
    -- Agendamento
    agendado_para            TIMESTAMPTZ,
    enviado_em               TIMESTAMPTZ,
    status                   TEXT NOT NULL DEFAULT 'RASCUNHO'
                                 CHECK (status IN ('RASCUNHO','AGENDADO','ENVIADO','CANCELADO')),
    -- Campos específicos DDS
    dds_tema                 TEXT,
    dds_duracao_min          INTEGER,
    dds_assinaturas_required BOOLEAN DEFAULT FALSE,
    -- Anexos: [{ nome, url, tipo }]
    anexos                   JSONB DEFAULT '[]'::jsonb,
    created_by               UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_org        ON public.communications(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_status     ON public.communications(org_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_tipo       ON public.communications(org_id, tipo);
CREATE INDEX IF NOT EXISTS idx_comm_agendado   ON public.communications(agendado_para) WHERE status = 'AGENDADO';

-- 2. RECIBOS DE LEITURA / ASSINATURA
CREATE TABLE IF NOT EXISTS public.communication_receipts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    communication_id UUID NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
    employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    lido_em          TIMESTAMPTZ,
    assinado_em      TIMESTAMPTZ,   -- DDS com assinatura obrigatória
    -- Rastreio WhatsApp
    whatsapp_status  TEXT CHECK (whatsapp_status IN ('PENDENTE','ENVIADO','ENTREGUE','LIDO','FALHOU')),
    whatsapp_sent_at TIMESTAMPTZ,
    UNIQUE (communication_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_receipts_comm ON public.communication_receipts(communication_id);
CREATE INDEX IF NOT EXISTS idx_comm_receipts_emp  ON public.communication_receipts(employee_id);

-- 3. FILA DE ENVIO WHATSAPP
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    communication_id UUID REFERENCES public.communications(id) ON DELETE CASCADE,
    employee_id      UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    telefone         TEXT NOT NULL,
    mensagem         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'PENDENTE'
                         CHECK (status IN ('PENDENTE','PROCESSANDO','ENVIADO','FALHOU')),
    tentativas       INTEGER DEFAULT 0,
    max_tentativas   INTEGER DEFAULT 3,
    ultimo_erro      TEXT,
    agendado_para    TIMESTAMPTZ DEFAULT NOW(),
    enviado_em       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wpp_queue_status   ON public.whatsapp_queue(status, agendado_para) WHERE status = 'PENDENTE';
CREATE INDEX IF NOT EXISTS idx_wpp_queue_org      ON public.whatsapp_queue(org_id);

-- 4. CONFIGURAÇÃO WHATSAPP POR ORG
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider           TEXT NOT NULL DEFAULT 'EVOLUTION'
                           CHECK (provider IN ('EVOLUTION','TWILIO','DIALOG360','WPPCONNECT')),
    api_url            TEXT,
    -- Nunca armazenar a chave em texto puro; usar referência ao vault/secret
    api_key_ref        TEXT,
    instance_name      TEXT,
    numero_remetente   TEXT,
    ativo              BOOLEAN DEFAULT FALSE,
    webhook_url        TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.communications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_config        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_org_access"     ON public.communications         FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "receipt_org_access"  ON public.communication_receipts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.communications c WHERE c.id = communication_id AND public.is_org_member(c.org_id))
);
CREATE POLICY "wpp_queue_org"       ON public.whatsapp_queue         FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "wpp_config_org"      ON public.whatsapp_config        FOR ALL USING (public.is_org_member(org_id));

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER trg_communications_updated_at
    BEFORE UPDATE ON public.communications
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_wpp_config_updated_at
    BEFORE UPDATE ON public.whatsapp_config
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- ============================================================
-- RPC: Disparar comunicado — gera recibos e fila WhatsApp
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_communication(p_comm_id UUID)
RETURNS JSON AS $$
DECLARE
    v_comm      public.communications;
    v_emp       RECORD;
    v_count     INTEGER := 0;
    v_wpp_count INTEGER := 0;
BEGIN
    SELECT * INTO v_comm FROM public.communications WHERE id = p_comm_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Comunicado não encontrado'); END IF;
    IF v_comm.status NOT IN ('RASCUNHO','AGENDADO') THEN
        RETURN json_build_object('error', 'Comunicado já enviado ou cancelado');
    END IF;

    -- Resolver destinatários conforme scope
    FOR v_emp IN
        SELECT e.id, e.phone FROM public.employees e
        WHERE e.org_id = v_comm.org_id AND e.status = 'ATIVO'
          AND (
            v_comm.scope = 'TODOS'
            OR (v_comm.scope = 'INDIVIDUAL' AND e.id = ANY(v_comm.scope_ids))
          )
    LOOP
        INSERT INTO public.communication_receipts (communication_id, employee_id)
        VALUES (p_comm_id, v_emp.id)
        ON CONFLICT (communication_id, employee_id) DO NOTHING;

        IF v_comm.canal_whatsapp AND v_emp.phone IS NOT NULL THEN
            INSERT INTO public.whatsapp_queue (org_id, communication_id, employee_id, telefone, mensagem)
            VALUES (v_comm.org_id, p_comm_id, v_emp.id, v_emp.phone,
                    v_comm.titulo || E'\n\n' || v_comm.conteudo);
            v_wpp_count := v_wpp_count + 1;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    UPDATE public.communications
    SET status = 'ENVIADO', enviado_em = NOW(), updated_at = NOW()
    WHERE id = p_comm_id;

    RETURN json_build_object('success', TRUE, 'destinatarios', v_count, 'wpp_enfileirados', v_wpp_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.dispatch_communication(UUID) TO authenticated;

-- ============================================================
-- VIEW: Taxa de leitura por comunicado
-- ============================================================
CREATE OR REPLACE VIEW public.vw_communication_read_rate AS
SELECT
    c.id,
    c.org_id,
    c.titulo,
    c.tipo,
    c.enviado_em,
    COUNT(r.id)                                           AS total_destinatarios,
    COUNT(r.lido_em)                                      AS total_lidos,
    COUNT(r.assinado_em)                                  AS total_assinados,
    ROUND(COUNT(r.lido_em)::NUMERIC / NULLIF(COUNT(r.id), 0) * 100, 1) AS taxa_leitura_pct
FROM public.communications c
LEFT JOIN public.communication_receipts r ON r.communication_id = c.id
WHERE c.status = 'ENVIADO'
GROUP BY c.id, c.org_id, c.titulo, c.tipo, c.enviado_em;
