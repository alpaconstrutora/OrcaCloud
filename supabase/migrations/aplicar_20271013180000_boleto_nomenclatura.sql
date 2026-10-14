-- Nomenclatura › "Boletos": o documento do boleto passa a ser renomeado conforme a
-- máscara configurada em Configurações do Sistema › Nomenclatura.
--
--   1. doc_type 'BOLETO' no CHECK de document_numbering_settings (lista inteira,
--      espelho de services/documentNumbering/types.ts).
--   2. boletos.documento_nome_original: guarda o nome de upload na 1ª renomeação.
--      É a trava "renomear UMA vez só" (sem gastar sequencial a cada salvar) e a
--      reversão: NÃO apagar esta coluna.
--
-- Idempotente. Sem policy nem função nova (REGRA #7 não se aplica).
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>   (NUNCA db push)

SET lock_timeout = '3s';

ALTER TABLE public.document_numbering_settings
    DROP CONSTRAINT IF EXISTS document_numbering_settings_doc_type_check;
ALTER TABLE public.document_numbering_settings
    ADD CONSTRAINT document_numbering_settings_doc_type_check CHECK (doc_type IN (
        'PURCHASE_ORDER', 'QUOTATION', 'SUPPLY_CONTRACT',
        'SERVICE_CONTRACT', 'SERVICE_PROPOSAL', 'SERVICE_CRM_CONTRACT',
        'UNIT_SALE_CONTRACT', 'RENTAL_CONTRACT',
        'SALE_DEAL', 'RENTAL_DEAL', 'CONDO_RATEIO',
        'PURCHASE_REQUEST',
        'OFICIO',
        'BOLETO'
    ));

ALTER TABLE public.boletos
    ADD COLUMN IF NOT EXISTS documento_nome_original TEXT;

COMMENT ON COLUMN public.boletos.documento_nome_original IS
    'Nome do arquivo como foi enviado, guardado na 1ª renomeação pela Nomenclatura (doc_type BOLETO). NULL = ainda não renomeado. Não apagar: é a reversão.';
