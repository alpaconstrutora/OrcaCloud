-- Seed para Tabelas Fiscais 2024 (Brasil)
-- INSS 2024
INSERT INTO public.payroll_fiscal_ranges (type, year, min_value, max_value, rate, deduction) VALUES
('INSS', 2024, 0, 1412.00, 0.0750, 0),
('INSS', 2024, 1412.01, 2666.68, 0.0900, 21.18),
('INSS', 2024, 2666.69, 4000.03, 0.1200, 101.18),
('INSS', 2024, 4000.04, 7786.02, 0.1400, 181.18);

-- IRRF 2024
INSERT INTO public.payroll_fiscal_ranges (type, year, min_value, max_value, rate, deduction) VALUES
('IRRF', 2024, 0, 2259.20, 0, 0),
('IRRF', 2024, 2259.21, 2826.65, 0.0750, 169.44),
('IRRF', 2024, 2826.66, 3751.05, 0.1500, 381.44),
('IRRF', 2024, 3751.06, 4664.68, 0.2250, 662.77),
('IRRF', 2024, 4664.69, 999999, 0.2750, 896.00);
