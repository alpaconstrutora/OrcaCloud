-- Contratos recorrentes: periodicidade Trimestral.
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
