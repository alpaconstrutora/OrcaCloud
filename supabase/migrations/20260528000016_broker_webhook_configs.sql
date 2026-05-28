-- Webhooks configuráveis do Portal do Corretor
CREATE TABLE IF NOT EXISTS public.broker_webhook_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'LEAD_CRIADO','PROPOSTA_ENVIADA','VENDA_FECHADA',
                        'RESERVA_CRIADA','RESERVA_EXPIRADA','PROPOSTA_APROVADA',
                        'PROPOSTA_REJEITADA')),
    endpoint_url    TEXT NOT NULL,
    secret_hint     TEXT,   -- apenas hint (últimos 4 chars); nunca armazenar o secret completo
    status          TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','INATIVO')),
    last_triggered  TIMESTAMPTZ,
    events_count    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_webhooks_org ON public.broker_webhook_configs(organization_id);

ALTER TABLE public.broker_webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_webhooks_org_access"
    ON public.broker_webhook_configs FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
