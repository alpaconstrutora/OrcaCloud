-- A Entrada (down_payment) não é um item de custom_installments — é um campo
-- solto da negociação. O Plano de Pagamento (Gerenciar Negociação → Forma de
-- Pagamento) ganhou colunas de Tipo de Pagamento e Descrição por parcela
-- (migration 20270819000010_...custom_installments), mas a Entrada ficou de
-- fora: não tinha onde guardar esses dois campos, então não aparecia como
-- linha do Plano de Pagamento.
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS down_payment_payment_type TEXT;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS down_payment_notes TEXT;

COMMENT ON COLUMN commercial_deals.down_payment_payment_type IS
    'Tipo de pagamento da Entrada (PIX/TED/DOC/DINHEIRO/CHEQUE/PERMUTA) — espelha PaymentInstallment.paymentType, mas a Entrada vive no campo down_payment, não em custom_installments.';
COMMENT ON COLUMN commercial_deals.down_payment_notes IS
    'Observação livre da Entrada — espelha PaymentInstallment.notes.';
