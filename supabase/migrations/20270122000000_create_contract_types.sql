-- Catálogo gerenciável de Tipos de Contrato (Configurações do Sistema)
-- Antes disso, contract_type era uma lista fixa via CHECK constraint (20261104000002).
CREATE TABLE IF NOT EXISTS public.contract_types (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'Geral' CHECK (category IN ('Serviços', 'Suprimentos', 'Geral')),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(name, organization_id)
);

ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read contract types" ON public.contract_types;
DROP POLICY IF EXISTS "Allow authenticated users to manage contract types" ON public.contract_types;

CREATE POLICY "Allow authenticated users to read contract types" ON public.contract_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage contract types" ON public.contract_types
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- contract_type passa a ser validado pelo catálogo (client-side), não mais por lista fixa no banco
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_contract_type_check;
