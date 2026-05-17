-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
    order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL, -- Can be linked later
    file_path text NOT NULL,
    file_name text NOT NULL,
    amount numeric,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas de acesso
CREATE POLICY "Permitir leitura publica" ON public.invoices FOR SELECT TO public USING (true);
CREATE POLICY "Permitir insercao publica" ON public.invoices FOR INSERT TO public WITH CHECK (true);

-- 2. Criar Bucket de Armazenamento
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- PolÃ­ticas de Storage
CREATE POLICY "Upload publico invoices" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "Leitura publica invoices" ON storage.objects FOR SELECT TO public USING (bucket_id = 'invoices');
CREATE POLICY "Exclusao publica invoices" ON storage.objects FOR DELETE TO public USING (bucket_id = 'invoices');
