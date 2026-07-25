-- Catálogo gerenciável de Tipos de Pagamento (Configurações → Categorias Gerais).
-- Alimenta o dropdown "Tipo Pagto." do Plano de Pagamento (Comercial → Venda de
-- Ativos → Gerenciar Negociação). Antes era um enum hardcoded em DealModal.tsx.
-- Padrão espelhado de 20270122000000_create_contract_types.sql.
CREATE TABLE IF NOT EXISTS public.payment_types (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    -- Código estável gravado em commercial_deals.custom_installments (retrocompat)
    -- e usado para resolver a periodicidade do gerador de parcelas.
    code text,
    -- Intervalo entre parcelas geradas (meses); NULL = não gera série automática.
    interval_months integer,
    -- true = aparece no gerador de parcelas em série ("Gerar Parcelas").
    generates_series boolean NOT NULL DEFAULT false,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(name, organization_id)
);

ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read payment types" ON public.payment_types;
DROP POLICY IF EXISTS "Allow authenticated users to manage payment types" ON public.payment_types;

CREATE POLICY "Allow authenticated users to read payment types" ON public.payment_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage payment types" ON public.payment_types
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
