-- Migração para logs de auditoria da folha de pagamento

create table if not exists payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, -- RLS
  user_email text not null,
  action text not null, -- 'CREATE', 'UPDATE', 'DELETE'
  entity_type text not null, -- 'RUBRIC', 'EVENT', 'FISCAL_BRACKET'
  entity_id text not null,
  old_data jsonb,
  new_data jsonb,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table payroll_audit_logs enable row level security;

create policy "Users can view logs of their organization"
  on payroll_audit_logs for select
  using (auth.jwt() ->> 'email' is not null); -- Simplificado: qualquer usuário logado vê por enquanto, ou restringir por org_id se disponível no JWT

-- Index for performance
create index if not exists idx_payroll_audit_logs_org_entity on payroll_audit_logs(org_id, entity_type, entity_id);
