-- ============================================================
-- Aditivo de PRORROGAÇÃO de locação + assinatura própria do aditivo.
--
-- A renovação passa a ter dois caminhos: contrato-filho (já existente, ver
-- 20270827000001) ou ADITIVO, que estende o MESMO contrato. Para o aditivo
-- gerar as parcelas do período prorrogado, ele precisa carregar as fronteiras
-- e o valor do período — `new_end_date` sozinho não diz DE ONDE gerar.
--
-- ⚠️ `new_value` existe em vez de reutilizar `value_impact`: em contrato
-- recorrente o aditivo NÃO soma um montante ao contrato, ele TROCA a
-- mensalidade. Gravar o aluguel em `value_impact` faria
-- contractService.updateContract somá-lo ao original_value e inflar o contrato.
-- ============================================================

SET lock_timeout = '3s';

ALTER TABLE public.contract_addendums
    -- REGRA #5: permite ler/filtrar por organização sem depender de join.
    ADD COLUMN IF NOT EXISTS organization_id        uuid,
    -- Fronteiras do período prorrogado.
    ADD COLUMN IF NOT EXISTS new_start_date         date,
    ADD COLUMN IF NOT EXISTS previous_end_date      date,
    -- Aluguel mensal vigente antes e depois do aditivo.
    ADD COLUMN IF NOT EXISTS new_value              numeric(15,2),
    ADD COLUMN IF NOT EXISTS previous_value         numeric(15,2),
    ADD COLUMN IF NOT EXISTS reajuste_index         text,
    ADD COLUMN IF NOT EXISTS reajuste_fator         numeric(12,6),
    -- Quantas parcelas o aditivo gerou (idempotência + auditoria).
    ADD COLUMN IF NOT EXISTS installments_generated smallint,
    -- Assinatura própria (ZapSign). Denormaliza a versão de documento assinada.
    ADD COLUMN IF NOT EXISTS signature_status       text,
    ADD COLUMN IF NOT EXISTS signature_token        text,
    ADD COLUMN IF NOT EXISTS signature_url          text,
    ADD COLUMN IF NOT EXISTS signature_completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS signed_document_url    text;

COMMENT ON COLUMN public.contract_addendums.new_start_date IS
 'Início do período prorrogado (= end_date anterior + 1 dia). É o gatilho do ramo de prorrogação em contractService.approveAddendum.';
COMMENT ON COLUMN public.contract_addendums.new_value IS
 'Aluguel mensal APÓS o aditivo. Em recorrente o aditivo troca a mensalidade — por isso value_impact fica 0.';
COMMENT ON COLUMN public.contract_addendums.previous_end_date IS
 'Fim de vigência anterior, para permitir desfazer a prorrogação (undoAddendumRenewal).';

ALTER TABLE public.contract_addendums
    DROP CONSTRAINT IF EXISTS contract_addendums_signature_status_check;
ALTER TABLE public.contract_addendums
    ADD CONSTRAINT contract_addendums_signature_status_check
    CHECK (signature_status IS NULL OR signature_status IN
           ('PENDING', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'));

-- Backfill da organização (tabela fria — UPDATE direto é seguro aqui).
UPDATE public.contract_addendums a
   SET organization_id = c.organization_id
  FROM public.contracts c
 WHERE c.id = a.contract_id
   AND a.organization_id IS NULL;

-- O webhook do ZapSign casa por token.
CREATE UNIQUE INDEX IF NOT EXISTS uq_addendums_signature_token
    ON public.contract_addendums (signature_token)
    WHERE signature_token IS NOT NULL;

RESET lock_timeout;
