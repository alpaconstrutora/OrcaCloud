-- ============================================================
-- Fase 1.2 + 1.3: campos de assinatura e distrato em commercial_deals
-- ============================================================

-- Assinatura eletrônica (ZapSign)
ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS signature_token        TEXT,
    ADD COLUMN IF NOT EXISTS signature_status       TEXT DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS signature_url          TEXT,
    ADD COLUMN IF NOT EXISTS signature_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signed_contract_url    TEXT;

-- Distrato / Cancelamento estruturado
ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS cancellation_reason       TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_date         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_refund_amount NUMERIC(15,2);

-- Índice para lookup de token de assinatura (usado pelo webhook)
CREATE INDEX IF NOT EXISTS idx_commercial_deals_signature_token
    ON public.commercial_deals (signature_token)
    WHERE signature_token IS NOT NULL;
