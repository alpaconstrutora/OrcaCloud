-- Locação: IRRF retido quando o inquilino é PJ e o locador é PF (10/10/2026)
-- Plano: docs/planos/2026-10-10-tributos-liquido-retencao.md
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA `db push`.
-- Idempotente. Só acrescenta uma coluna anulável (sem default = só metadado).

SET lock_timeout = '5s';

-- Locador da negociação, como CLIENTE do cadastro: o Tipo de pessoa dele
-- (clients.type PF/PJ) decide se há retenção de IRRF. Até aqui o locador era
-- sempre uma empresa (companies), sem como representar pessoa física.
ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS locador_client_id uuid;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_deals_locador_client_id_fkey') THEN
        ALTER TABLE public.commercial_deals
            ADD CONSTRAINT commercial_deals_locador_client_id_fkey
            FOREIGN KEY (locador_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
    END IF;
END $$;
COMMENT ON COLUMN public.commercial_deals.locador_client_id IS
    'Só locação. Locador como cliente cadastrado; se PF e algum inquilino for PJ, a negociação pede confirmação da retenção de IRRF (chave irrf em tributos_retidos).';

COMMENT ON COLUMN public.commercial_deals.tributos_retidos IS
    'Tributos retidos pelo cliente na fonte (pis/cofins/inss/irrf). O tributo retido nasce com business_status RETIDO e a parcela concilia pelo valor líquido (valor_esperado). irrf: só gerado quando marcado (inquilino PJ, locador PF).';
