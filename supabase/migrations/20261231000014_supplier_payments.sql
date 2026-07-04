-- Migration: Pagamento de Títulos (AP) via Asaas — Fase 1 (boleto de terceiro)
-- Data: 2026-07-03
-- Espelho de client_charges (20261119000002), lado saída em vez de entrada.
-- Ver PLANO_MODULO_PAGAMENTO_TITULOS.md

create table if not exists public.supplier_payments (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,

    transaction_id        uuid references public.internal_transactions(id) on delete set null,
    boleto_id             uuid references public.boletos(id) on delete set null,
    supplier_id           uuid references public.suppliers(id) on delete set null,

    provider              text not null default 'asaas',
    payment_type          text not null check (payment_type in ('BILL','PIX_TRANSFER')),

    asaas_bill_id         text,
    asaas_transfer_id     text,

    pix_key               text,           -- snapshot da chave usada (PIX_TRANSFER, Fase 2)
    identification_field  text,           -- snapshot da linha digitável usada (BILL)
    beneficiary_name      text,           -- nome retornado pela Asaas (confirmação anti-fraude)

    value                 numeric(15,2) not null,
    fee                   numeric(15,2),
    scheduled_date        date,

    status                text not null default 'AWAITING_APPROVAL'
                          check (status in (
                              'AWAITING_APPROVAL','APPROVED','PENDING','SCHEDULED',
                              'DONE','FAILED','CANCELLED'
                          )),
    failure_reason        text,
    authentication_code   text,
    receipt_url           text,

    approved_by_email     text,
    approved_at           timestamptz,
    created_by_email      text,

    -- Resposta bruta da Asaas (quote e pay). O schema de resposta de /v3/bill/simulate
    -- e /v3/bill não é documentado publicamente com o mesmo detalhe de /v3/payments;
    -- guardamos aqui para conferir os nomes de campo reais no primeiro teste em sandbox
    -- (mesmo padrão de boletos.extracao_raw).
    raw_response          jsonb,

    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists idx_supplier_payments_org         on public.supplier_payments(organization_id);
create index if not exists idx_supplier_payments_transaction  on public.supplier_payments(transaction_id);
create index if not exists idx_supplier_payments_boleto       on public.supplier_payments(boleto_id);
create index if not exists idx_supplier_payments_supplier     on public.supplier_payments(supplier_id);
create index if not exists idx_supplier_payments_status       on public.supplier_payments(status);
create index if not exists idx_supplier_payments_asaas_bill   on public.supplier_payments(asaas_bill_id) where asaas_bill_id is not null;

create or replace function public.supplier_payments_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_supplier_payments_updated_at on public.supplier_payments;
create trigger trg_supplier_payments_updated_at
    before update on public.supplier_payments
    for each row execute function public.supplier_payments_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.supplier_payments enable row level security;

drop policy if exists "supplier_payments_select" on public.supplier_payments;
drop policy if exists "supplier_payments_insert" on public.supplier_payments;
drop policy if exists "supplier_payments_update" on public.supplier_payments;
drop policy if exists "supplier_payments_anon_all" on public.supplier_payments;

-- Leitura: qualquer membro da org (mesmo padrão de client_charges/boletos).
create policy "supplier_payments_select" on public.supplier_payments
    for select to authenticated
    using (public.is_org_member(organization_id));

-- Escrita via authenticated fica restrita a criar/editar enquanto ainda não foi disparada
-- (status AWAITING_APPROVAL/APPROVED). Depois de enviada para a Asaas, só a Edge Function
-- (service role) altera o status — reforça que o disparo real passa pelo backend, nunca
-- por update direto do client. Trilha de auditoria dedicada + RLS por role fica pra Fase 3.
create policy "supplier_payments_insert" on public.supplier_payments
    for insert to authenticated
    with check (public.is_org_member(organization_id) and status = 'AWAITING_APPROVAL');

create policy "supplier_payments_update" on public.supplier_payments
    for update to authenticated
    using (public.is_org_member(organization_id) and status in ('AWAITING_APPROVAL','APPROVED'))
    with check (public.is_org_member(organization_id));

-- Acesso anônimo para fluxo de dev (mesmo padrão das demais tabelas financeiras do projeto)
create policy "supplier_payments_anon_all" on public.supplier_payments
    for all to anon using (true) with check (true);
