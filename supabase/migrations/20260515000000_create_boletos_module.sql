-- Migration: Módulo de Captura de Boletos
-- Data: 2026-05-15
-- Objetivo: eliminar lançamento manual de contas a pagar a partir de boletos.

-- ============================================================================
-- 1. Tabela principal: boletos
-- ============================================================================
create table if not exists public.boletos (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,

    -- Documento original
    documento_path        text not null,
    documento_nome        text not null,
    documento_hash        text not null,
    documento_mime        text,
    documento_paginas     int,
    documento_tamanho     bigint,

    -- Dados extraídos
    linha_digitavel       text,
    codigo_barras         text,
    qr_pix                text,
    banco_codigo          text,
    banco_nome            text,
    valor                 numeric(15,2),
    valor_original        numeric(15,2),
    vencimento            date,
    data_documento        date,

    beneficiario_nome     text,
    beneficiario_cnpj     text,
    beneficiario_banco    text,
    beneficiario_agencia  text,
    beneficiario_conta    text,

    pagador_nome          text,
    pagador_cnpj          text,

    -- Metadados de extração
    metodo_extracao       text check (metodo_extracao in ('deterministic','pdf_text','manual','ocr_local','ocr_cloud')),
    confidence_score      int check (confidence_score between 0 and 100),
    engine_versao         text,
    extracao_raw          jsonb,
    extracao_em           timestamptz,

    -- Validação
    checksum_valido       boolean,
    duplicado_de          uuid references public.boletos(id) on delete set null,
    erros_validacao       jsonb,

    -- Associação operacional
    project_id            uuid references public.projects(id) on delete set null,
    cost_center_id        uuid references public.cost_centers(id) on delete set null,
    supplier_id           uuid references public.suppliers(id) on delete set null,
    chart_of_accounts_id  uuid references public.chart_of_accounts(id) on delete set null,
    invoice_id            uuid references public.invoices(id) on delete set null,

    -- Sugestões antes da confirmação humana
    sugestao_supplier_id  uuid references public.suppliers(id) on delete set null,
    sugestao_cc_id        uuid references public.cost_centers(id) on delete set null,
    sugestao_confianca    int,

    -- Workflow
    status                text not null default 'rascunho'
                          check (status in ('rascunho','revisao','aprovado','programado','pago','cancelado')),
    observacoes           text,

    created_by            uuid,
    created_by_email      text,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),

    constraint boletos_doc_hash_org_unique
        unique (organization_id, documento_hash)
);

create index if not exists idx_boletos_org           on public.boletos(organization_id);
create index if not exists idx_boletos_status        on public.boletos(status);
create index if not exists idx_boletos_vencimento    on public.boletos(vencimento);
create index if not exists idx_boletos_supplier      on public.boletos(supplier_id);
create index if not exists idx_boletos_project       on public.boletos(project_id);
create index if not exists idx_boletos_invoice       on public.boletos(invoice_id);
create index if not exists idx_boletos_duplicado     on public.boletos(duplicado_de) where duplicado_de is not null;

-- updated_at automático
create or replace function public.boletos_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_boletos_updated_at on public.boletos;
create trigger trg_boletos_updated_at
    before update on public.boletos
    for each row execute function public.boletos_set_updated_at();

-- ============================================================================
-- 2. Tabela de auditoria imutável
-- ============================================================================
create table if not exists public.boletos_auditoria (
    id              uuid primary key default gen_random_uuid(),
    boleto_id       uuid not null references public.boletos(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    acao            text not null,
    campo           text,
    valor_antes     jsonb,
    valor_depois    jsonb,
    metodo          text check (metodo in ('sistema','usuario')),
    usuario_email   text,
    created_at      timestamptz not null default now()
);

create index if not exists idx_boletos_auditoria_boleto on public.boletos_auditoria(boleto_id);
create index if not exists idx_boletos_auditoria_org    on public.boletos_auditoria(organization_id);

-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table public.boletos enable row level security;
alter table public.boletos_auditoria enable row level security;

drop policy if exists "boletos_select" on public.boletos;
drop policy if exists "boletos_insert" on public.boletos;
drop policy if exists "boletos_update" on public.boletos;
drop policy if exists "boletos_delete" on public.boletos;

create policy "boletos_select" on public.boletos
    for select to authenticated
    using (public.is_org_member(organization_id));

create policy "boletos_insert" on public.boletos
    for insert to authenticated
    with check (public.is_org_member(organization_id));

create policy "boletos_update" on public.boletos
    for update to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

create policy "boletos_delete" on public.boletos
    for delete to authenticated
    using (public.is_org_member(organization_id));

drop policy if exists "boletos_audit_select" on public.boletos_auditoria;
drop policy if exists "boletos_audit_insert" on public.boletos_auditoria;

create policy "boletos_audit_select" on public.boletos_auditoria
    for select to authenticated
    using (public.is_org_member(organization_id));

create policy "boletos_audit_insert" on public.boletos_auditoria
    for insert to authenticated
    with check (public.is_org_member(organization_id));

-- Acesso anônimo para fluxo de dev (mesmo padrão das demais tabelas financeiras)
create policy "boletos_anon_all" on public.boletos
    for all to anon using (true) with check (true);

create policy "boletos_audit_anon_all" on public.boletos_auditoria
    for all to anon using (true) with check (true);

-- ============================================================================
-- 4. Storage bucket
-- ============================================================================
insert into storage.buckets (id, name, public)
    values ('boletos', 'boletos', true)
    on conflict (id) do nothing;

drop policy if exists "boletos_storage_all" on storage.objects;
create policy "boletos_storage_all" on storage.objects
    for all to public
    using (bucket_id = 'boletos')
    with check (bucket_id = 'boletos');
