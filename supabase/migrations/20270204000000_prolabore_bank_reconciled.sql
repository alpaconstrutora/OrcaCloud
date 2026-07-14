-- Registra, do lado do RH, o total de pró-labore conferido/aprovado na
-- Conciliação Bancária (Financeiro) — canal de volta Financeiro→RH.
-- Não duplica internal_transactions/invoices (esses já existem, gerados por
-- sendPayrollToFinancial ou lançados manualmente no banco); só grava o total
-- e quem confirmou, fechando o loop de conferência.
alter table public.prolabore_payrolls
    add column if not exists bank_reconciled_total numeric,
    add column if not exists bank_reconciled_at timestamptz,
    add column if not exists bank_reconciled_by_email text;
