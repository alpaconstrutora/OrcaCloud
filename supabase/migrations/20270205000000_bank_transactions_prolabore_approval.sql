-- A aba Pró-labore da Conciliação Bancária também precisa listar lançamentos
-- categorizados como Pró-labore/Prolabore diretamente no EXTRATO
-- (bank_transactions), antes de qualquer conciliação com internal_transactions
-- — não só os já gerados pelo RH. bank_transactions não tem approval_status
-- (esse mecanismo só existe em internal_transactions, ligado a
-- financial_approval_config); por isso ganha um flag simples e dedicado, sem
-- entrar no motor de aprovação multinível genérico (approvalService), que não
-- se aplica a lançamentos ainda não conciliados.
alter table public.bank_transactions
    add column if not exists prolabore_approved_at timestamptz,
    add column if not exists prolabore_approved_by text;
