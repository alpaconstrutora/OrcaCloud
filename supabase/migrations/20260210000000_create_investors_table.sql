-- Create investors table
CREATE TABLE IF NOT EXISTS public.investors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    phone text,
    document text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow authenticated users to read investors" ON public.investors
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage investors" ON public.investors
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
