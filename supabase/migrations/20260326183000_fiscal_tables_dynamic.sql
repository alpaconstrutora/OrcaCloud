-- 1. Tabela de Faixas Progressivas de INSS
CREATE TABLE IF NOT EXISTS public.inss_brackets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    valid_from DATE NOT NULL,
    valid_to DATE,
    min_value NUMERIC(15,2) NOT NULL,
    max_value NUMERIC(15,2),
    rate NUMERIC(5,4) NOT NULL,
    deduction NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Faixas de IRRF
CREATE TABLE IF NOT EXISTS public.irrf_brackets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    valid_from DATE NOT NULL,
    valid_to DATE,
    min_value NUMERIC(15,2) NOT NULL,
    max_value NUMERIC(15,2),
    rate NUMERIC(5,4) NOT NULL,
    deduction NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Configuração de FGTS
CREATE TABLE IF NOT EXISTS public.fgts_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    valid_from DATE NOT NULL,
    valid_to DATE,
    rate NUMERIC(5,4) NOT NULL DEFAULT 0.0800,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.inss_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrf_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fgts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inss_read_all" ON public.inss_brackets FOR SELECT TO authenticated USING (true);
CREATE POLICY "irrf_read_all" ON public.irrf_brackets FOR SELECT TO authenticated USING (true);
CREATE POLICY "fgts_read_all" ON public.fgts_config FOR SELECT TO authenticated USING (true);

-- Seed: Tabela INSS 2024
INSERT INTO public.inss_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
('2024-01-01', NULL, 0, 1412.00, 0.0750, 0),
('2024-01-01', NULL, 1412.01, 2666.68, 0.0900, 21.18),
('2024-01-01', NULL, 2666.69, 4000.03, 0.1200, 101.18),
('2024-01-01', NULL, 4000.04, 7786.02, 0.1400, 181.18);

-- Seed: Tabela IRRF 2024 (Conforme imagem do usuário - MP 1206/24)
INSERT INTO public.irrf_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
('2024-02-01', NULL, 0, 2428.80, 0, 0),
('2024-02-01', NULL, 2428.81, 2826.65, 0.0750, 182.16),
('2024-02-01', NULL, 2826.66, 3751.05, 0.1500, 394.16),
('2024-02-01', NULL, 3751.06, 4664.68, 0.2250, 675.49),
('2024-02-01', NULL, 4664.69, NULL, 0.2750, 908.73);

-- Seed: FGTS 2024
INSERT INTO public.fgts_config (valid_from, valid_to, rate) VALUES
('2024-01-01', NULL, 0.0800);
