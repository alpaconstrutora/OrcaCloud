-- Plano de Pagamento (Gerenciar Negociação → Forma de Pagamento): nova coluna
-- "Tipo de Pagamento" (Sinal/mensal/trimestral/semestral/anual/avulsa), separada
-- da "Forma de Pagamento" (PIX/TED/DOC/...) já existente (migration
-- 20270820000003). Para as parcelas do array custom_installments isso é só uma
-- chave a mais no JSON (installmentType) — não precisa de coluna. A Entrada não
-- é item do array (vive nos campos soltos down_payment*), por isso precisa da
-- coluna própria, espelhando down_payment_payment_type/down_payment_notes.
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS down_payment_installment_type TEXT;

COMMENT ON COLUMN commercial_deals.down_payment_installment_type IS
    'Tipo de pagamento da Entrada (SINAL/MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL/AVULSA) — espelha PaymentInstallment.installmentType, mas a Entrada vive no campo down_payment, não em custom_installments.';
