-- Add financial fields to purchase_orders
alter table if exists public.purchase_orders 
add column if not exists is_financial_approved boolean default false,
add column if not exists bank_account text,
add column if not exists cost_center text,
add column if not exists chart_of_accounts text;

-- Add comments for clarity
comment on column public.purchase_orders.is_financial_approved is 'Financial approval status for payment';
comment on column public.purchase_orders.bank_account is 'Target bank account for the payment';
comment on column public.purchase_orders.cost_center is 'Project cost center for allocation';
comment on column public.purchase_orders.chart_of_accounts is 'Specific account in the chart of accounts (Plano de Contas)';
