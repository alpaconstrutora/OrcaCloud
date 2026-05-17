-- Atualização das Tabelas Fiscais para 2025

-- 1. Encerrar vigência das tabelas de 2024 (assumindo que valid_from é < 2025-01-01)
UPDATE public.inss_brackets SET valid_to = '2024-12-31' WHERE (valid_to IS NULL OR valid_to > '2024-12-31') AND valid_from < '2025-01-01';
UPDATE public.irrf_brackets SET valid_to = '2024-12-31' WHERE (valid_to IS NULL OR valid_to > '2024-12-31') AND valid_from < '2025-01-01';

-- 2. Inserir Faixas INSS 2025 (Salário Mínimo R$ 1.518,00)
INSERT INTO public.inss_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
('2025-01-01', NULL, 0, 1518.00, 0.075, 0),
('2025-01-01', NULL, 1518.01, 2793.88, 0.09, 22.77),
('2025-01-01', NULL, 2793.89, 4190.83, 0.12, 106.59),
('2025-01-01', NULL, 4190.84, 8157.41, 0.14, 190.40);

-- 3. Inserir Faixas IRRF 2025 (Baseada na tabela simplificada vigente)
INSERT INTO public.irrf_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
('2025-01-01', NULL, 0, 2259.20, 0, 0),
('2025-01-01', NULL, 2259.21, 2828.65, 0.075, 169.44),
('2025-01-01', NULL, 2828.66, 3751.05, 0.15, 381.59),
('2025-01-01', NULL, 3751.06, 4664.68, 0.225, 662.92),
('2025-01-01', NULL, 4664.69, NULL, 0.275, 896.00);

-- 4. Inserir Configuração FGTS 2025 
INSERT INTO public.fgts_config (valid_from, valid_to, rate) VALUES
('2025-01-01', NULL, 0.08);

NOTIFY pgrst, 'reload schema';
