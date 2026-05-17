-- Migration: Add Recurring Contracts
-- Date: 2026-04-28

-- 1. Modificar a Tabela contracts
ALTER TABLE public.contracts ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.contracts 
    ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('Mensal', 'Bimestral', 'Semestral', 'Anual')),
    ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31);

-- 2. Atualizar Constraints (Tipos e Naturezas)
-- Precisamos remover as constraints existentes e recriar com os novos valores
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_contract_type_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_contract_type_check CHECK (contract_type IN ('Empreitada Global', 'Preço Unitário', 'Administração', 'Subempreitada', 'Concessionária', 'Assinatura/SaaS', 'Manutenção Recorrente', 'Outros'));

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_nature_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_nature_check CHECK (nature IN ('Fornecimento', 'Serviço', 'Mão de Obra', 'Locação', 'Consumo', 'Outros'));

-- 3. Criar Tabela para Faturas Mensais (Consumo)
CREATE TABLE IF NOT EXISTS public.contract_utility_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    reference_month DATE NOT NULL,
    consumption_metric DECIMAL(15,4),
    total_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status TEXT DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Pago', 'Atrasado', 'Cancelado')),
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS contract_utility_bills_contract_idx ON public.contract_utility_bills(contract_id);

ALTER TABLE public.contract_utility_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view utility bills of their organization" 
ON public.contract_utility_bills FOR SELECT TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

CREATE POLICY "Users can manage utility bills of their organization" 
ON public.contract_utility_bills FOR ALL TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

CREATE POLICY "Allow anon all on contract_utility_bills" ON public.contract_utility_bills FOR ALL TO anon USING (true) WITH CHECK (true);
