-- Ajustes manuais que somam ao total real de pró-labore (base = extrato
-- conciliado, ver bank_reconciled_total em prolabore_payrolls) quando o valor
-- pago pelo banco não cobre tudo (ex.: pagamento ainda não no extrato,
-- correção pontual). Escopado por company_id+competence_month, não por
-- payroll_id, porque o Financeiro pode registrar isso antes mesmo de a folha
-- do RH existir para a competência.
create table if not exists public.prolabore_manual_entries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    competence_month date not null,
    amount numeric not null check (amount <> 0),
    description text,
    created_by_email text,
    created_at timestamptz not null default now()
);

create index if not exists idx_prolabore_manual_entries_company_month
    on public.prolabore_manual_entries(company_id, competence_month);

alter table public.prolabore_manual_entries enable row level security;

drop policy if exists "prolabore_manual_entries_all" on public.prolabore_manual_entries;
create policy "prolabore_manual_entries_all" on public.prolabore_manual_entries
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
