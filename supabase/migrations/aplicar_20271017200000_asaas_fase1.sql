-- Integração Asaas — Fase 1: correções da integração existente
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (itens 1.6, 1.9, 1.10, 1.13).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar as Edge Functions asaas-charge / asaas-status-sync
-- (elas gravam as colunas novas).
--
-- REGRA #7
--   Pergunta 1 (policy): a única policy recriada é `acc_update` de
--   asaas_charge_config, agora com WITH CHECK igual ao USING — sem OR algum;
--   antes o UPDATE permitia mover a linha para `organization_id` de outra org
--   (USING conferia a linha velha, nada conferia a nova). A policy de DELETE
--   de client_charges sai: nenhuma tela apaga cobrança (grep em services/ e
--   components/: só SELECT), e apagar a linha local deixava o boleto VIVO na
--   Asaas sem rastro aqui. Escrita em client_charges fica só com service_role
--   (Edge Functions), como já era para INSERT/UPDATE.
--   Pergunta 2 (função): nenhuma função criada.

BEGIN;

-- 1.10 — imagem do QR PIX (PNG base64) e validade, guardadas na emissão.
ALTER TABLE public.client_charges
    ADD COLUMN IF NOT EXISTS pix_qr_image   text,
    ADD COLUMN IF NOT EXISTS pix_expiration text;
COMMENT ON COLUMN public.client_charges.pix_qr_image IS
    'QR Code PIX em PNG base64 (GET /payments/{id}/pixQrCode → encodedImage). Lido sob demanda — fora da listagem.';
COMMENT ON COLUMN public.client_charges.pix_expiration IS
    'expirationDate do QR, como a Asaas manda (horário de Brasília, sem fuso). Texto de propósito: timestamptz o leria como UTC.';

-- 1.9 — rodízio do polling de fallback (asaas-status-sync).
ALTER TABLE public.client_charges
    ADD COLUMN IF NOT EXISTS asaas_checked_at timestamptz;
ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS asaas_checked_at timestamptz;
COMMENT ON COLUMN public.client_charges.asaas_checked_at IS
    'Última consulta do asaas-status-sync. Rodízio: cada execução pega as conferidas há mais tempo.';
COMMENT ON COLUMN public.supplier_payments.asaas_checked_at IS
    'Última consulta do asaas-status-sync. Rodízio: cada execução pega as conferidas há mais tempo.';

CREATE INDEX IF NOT EXISTS idx_supplier_payments_asaas_transfer
    ON public.supplier_payments (asaas_transfer_id) WHERE asaas_transfer_id IS NOT NULL;

-- 1.6 — uma cobrança viva por recebível; um pagamento em curso por boleto/título.
-- A Edge Function checa antes e devolve 409 com a mensagem certa; o índice é
-- a trava para a corrida (dois cliques, duas abas, lote + tela).
-- ⚠️ Índice PARCIAL: nunca usar upsert/onConflict contra ele (42P10).
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_charges_tx_ativa
    ON public.client_charges (transaction_id)
    WHERE transaction_id IS NOT NULL
      AND status NOT IN ('CANCELLED', 'DELETED', 'REFUNDED');

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payments_boleto_ativo
    ON public.supplier_payments (boleto_id)
    WHERE boleto_id IS NOT NULL
      AND status IN ('APPROVED', 'PENDING', 'SCHEDULED', 'DONE');

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payments_tx_ativo
    ON public.supplier_payments (transaction_id)
    WHERE transaction_id IS NOT NULL
      AND status IN ('APPROVED', 'PENDING', 'SCHEDULED', 'DONE');

-- 1.13 — RLS.
DROP POLICY IF EXISTS acc_update ON public.asaas_charge_config;
CREATE POLICY acc_update ON public.asaas_charge_config
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.organization_members om
         WHERE om.organization_id = asaas_charge_config.organization_id
           AND ((om.user_id IS NOT NULL AND om.user_id = auth.uid())
             OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email')))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.organization_members om
         WHERE om.organization_id = asaas_charge_config.organization_id
           AND ((om.user_id IS NOT NULL AND om.user_id = auth.uid())
             OR (om.user_id IS NULL AND lower(om.email) = lower(auth.jwt() ->> 'email')))
    ));

DROP POLICY IF EXISTS client_charges_delete ON public.client_charges;

-- Provas dentro da transação: falha aqui desfaz tudo.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_client_charges_tx_ativa') THEN
        RAISE EXCEPTION 'uq_client_charges_tx_ativa não criado';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_charges' AND cmd = 'DELETE') THEN
        RAISE EXCEPTION 'ainda há policy de DELETE em client_charges';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'asaas_charge_config'
                    AND policyname = 'acc_update' AND with_check IS NOT NULL) THEN
        RAISE EXCEPTION 'acc_update sem WITH CHECK';
    END IF;
    RAISE NOTICE 'OK: Asaas Fase 1 — colunas, índices e RLS aplicados.';
END $$;

COMMIT;
