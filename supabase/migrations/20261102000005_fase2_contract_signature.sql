-- =============================================================================
-- Fase 2.1 — Assinatura Eletrônica em contratos
-- =============================================================================
-- A Edge Function sign-contract já existe (ZapSign integration) mas estava
-- wired apenas a commercial_deals. Esta migration adiciona os campos necessários
-- em contracts para rastrear o ciclo de assinatura.
-- =============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signature_status TEXT
    CHECK (signature_status IN ('PENDING', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED')),
  ADD COLUMN IF NOT EXISTS signature_token  TEXT,
  ADD COLUMN IF NOT EXISTS signature_url    TEXT,
  ADD COLUMN IF NOT EXISTS signature_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contracts.signature_status IS
  'Status do processo de assinatura eletrônica: PENDING → SENT → SIGNED/EXPIRED/CANCELLED';
COMMENT ON COLUMN public.contracts.signature_token IS
  'Token do documento no ZapSign para rastrear webhook de conclusão';
COMMENT ON COLUMN public.contracts.signature_url IS
  'URL de assinatura enviada ao signatário (primeiro assinante)';
COMMENT ON COLUMN public.contracts.signature_completed_at IS
  'Timestamp em que a assinatura foi concluída (preenchido pelo webhook)';

CREATE INDEX IF NOT EXISTS idx_contracts_signature_token
  ON public.contracts(signature_token)
  WHERE signature_token IS NOT NULL;
