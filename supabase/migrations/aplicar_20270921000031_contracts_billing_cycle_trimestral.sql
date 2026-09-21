-- Contratos recorrentes: periodicidade Trimestral.
--
-- ⚠️ JÁ APLICADA no banco remoto em 2026-09-21 (db query -f), ainda com o
-- nome 20270921000001_contracts_billing_cycle_trimestral.sql — renomeada para
-- 000031 porque o prefixo 000001 já era de outra frente
-- (aplicar_20270921000001_supplier_portal_dados_bancarios.sql). Rodar de novo
-- é inócuo (DROP IF EXISTS + ADD do mesmo CHECK).
--
-- O CHECK original (20260428000000_add_recurring_contracts.sql) só aceitava
-- Mensal/Bimestral/Semestral/Anual. Pedido de 2026-09-21 (Contrato › Financeiro
-- › Parcelado): oferecer também trimestral. O código já sabia avançar por
-- 'Trimestral' na classificação da parcela (tipoDaCadencia), mas não no
-- calendário (advanceCycle) nem no banco — os dois foram alinhados junto.
--
-- Idempotente: DROP IF EXISTS + ADD. Sem policy nem função (REGRA #7 não se aplica).
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_billing_cycle_check;
ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_billing_cycle_check
    CHECK (billing_cycle IN ('Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'));
