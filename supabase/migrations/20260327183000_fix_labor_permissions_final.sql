-- Fix RLS and Schema Cache for Labor Module
-- Tabelas: rubrics, payroll_audit_logs

-- 1. Garantir que as tabelas existam (caso migrações anteriores falharam)
CREATE TABLE IF NOT EXISTS public.rubrics (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('provento', 'desconto', 'encargo')),
  incidence_inss BOOLEAN DEFAULT false,
  incidence_fgts BOOLEAN DEFAULT false,
  incidence_irrf BOOLEAN DEFAULT false,
  is_automatic BOOLEAN DEFAULT false,
  category TEXT,
  formula TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null, -- Mudado para text para aceitar 'SYSTEM'
  user_email text not null,
  action text not null, 
  entity_type text not null, 
  entity_id text not null,
  old_data jsonb,
  new_data jsonb,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitar RLS
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Limpar políticas antigas
DROP POLICY IF EXISTS "rubrics_read_all" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_manage_all" ON public.rubrics;
DROP POLICY IF EXISTS "Users can view logs of their organization" ON public.payroll_audit_logs;
DROP POLICY IF EXISTS "payroll_audit_logs_manage_all" ON public.payroll_audit_logs;

-- 4. Criar novas políticas permissivas para Authenticated
CREATE POLICY "rubrics_manage_all" ON public.rubrics
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "payroll_audit_logs_manage_all" ON public.payroll_audit_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';

-- 6. Garantir rubricas básicas (sem conflito)
INSERT INTO public.rubrics (code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_automatic, category) 
VALUES
('SALARIO', 'Salário Base', 'provento', true, true, true, true, 'base'),
('INSS', 'Desconto INSS', 'desconto', false, false, false, true, 'tax'),
('IRRF', 'Desconto IRRF', 'desconto', false, false, false, true, 'tax'),
('FGTS', 'FGTS (Encargo)', 'encargo', false, false, false, true, 'tax')
ON CONFLICT (code) DO NOTHING;
