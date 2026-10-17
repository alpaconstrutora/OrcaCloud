-- Integração Asaas — Fase 3: pagamento por PIX (POST /v3/transfers)
--
-- Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (itens 3.1–3.4).
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar a asaas-payment desta fase.
--
-- REGRA #7: nenhuma policy nem função criada — só colunas e CHECKs.

BEGIN;

-- Snapshot do destino no momento do disparo (auditoria): o cadastro pode
-- mudar depois, o que foi pago não.
ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS pix_key_type         text,
    ADD COLUMN IF NOT EXISTS beneficiary_document text,
    ADD COLUMN IF NOT EXISTS favorecido_origem    text,
    ADD COLUMN IF NOT EXISTS asaas_authorized     boolean;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_pix_key_type_check') THEN
        ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_pix_key_type_check
            CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_favorecido_origem_check') THEN
        ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_favorecido_origem_check
            CHECK (favorecido_origem IS NULL OR favorecido_origem IN ('fornecedor', 'colaborador', 'socio', 'avulso'));
    END IF;
END $$;

COMMENT ON COLUMN public.supplier_payments.favorecido_origem IS
    'De onde veio a chave PIX: cadastro do fornecedor/colaborador/sócio, ou avulso (digitada no disparo — teto próprio).';
COMMENT ON COLUMN public.supplier_payments.asaas_authorized IS
    'false = a Asaas segura a transferência esperando autorização por token (validação de eventos críticos ligada na conta).';

-- Sócio: a chave existia sem tipo e sem tela. Tipo explícito agora.
ALTER TABLE public.company_partners
    ADD COLUMN IF NOT EXISTS pix_tipo text;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_partners_pix_tipo_check') THEN
        ALTER TABLE public.company_partners ADD CONSTRAINT company_partners_pix_tipo_check
            CHECK (pix_tipo IS NULL OR pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'));
    END IF;
END $$;

DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'supplier_payments'
           AND column_name IN ('pix_key_type', 'beneficiary_document', 'favorecido_origem', 'asaas_authorized')) <> 4 THEN
        RAISE EXCEPTION 'colunas de supplier_payments incompletas';
    END IF;
    RAISE NOTICE 'OK: Asaas Fase 3 — colunas do PIX aplicadas.';
END $$;

COMMIT;
