-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    phone text,
    document text, -- CPF/CNPJ
    type text CHECK (type IN ('PF', 'PJ')),
    category text, -- e.g. "Materiais", "ServiÃ§os", "Equipamentos"
    address text,
    city text,
    state text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow authenticated users to read suppliers" ON public.suppliers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage suppliers" ON public.suppliers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
