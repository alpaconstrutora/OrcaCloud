-- Correção fiscal: IRRF 2026, registro fantasma IRRF 2023, FGTS duplicado
-- Baseado em: AUDITORIA_FISCAL_RESULTADO.md (23/04/2026)
-- Fonte IRRF 2026: Instrução Normativa RFB nº 2.216/2024

-- 1. Encerrar vigência aberta das faixas IRRF 2025
UPDATE public.irrf_brackets
SET valid_to = '2025-12-31'
WHERE valid_from = '2025-01-01' AND (valid_to IS NULL OR valid_to > '2025-12-31');

-- 2. Remover registro fantasma IRRF 2023 (min=0, max=0, rate=0)
DELETE FROM public.irrf_brackets
WHERE valid_from = '2023-01-01'
  AND min_value = 0 AND max_value = 0 AND rate = 0;

-- 3. Inserir faixas IRRF 2026 (IN RFB 2.216/2024 — mesmos limites de 2025,
--    com atualização da faixa de isenção para R$ 2.428,80)
INSERT INTO public.irrf_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
('2026-01-01', NULL,    0.00,    2428.80, 0.000,   0.00),
('2026-01-01', NULL, 2428.81,   2826.65, 0.075, 182.16),
('2026-01-01', NULL, 2826.66,   3751.05, 0.150, 394.16),
('2026-01-01', NULL, 3751.06,   4664.68, 0.225, 675.49),
('2026-01-01', NULL, 4664.69,      NULL, 0.275, 908.73);

-- 4. Limpar duplicatas FGTS: manter apenas o mais recente por período,
--    encerrando vigências abertas conflitantes
--    (taxa é 8% em todos — sem impacto de cálculo, apenas organização)
UPDATE public.fgts_config
SET valid_to = '2024-12-31'
WHERE valid_from = '2024-01-01' AND valid_to IS NULL
  AND id != (
    SELECT id FROM public.fgts_config
    WHERE valid_from = '2024-01-01' AND valid_to IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  );

UPDATE public.fgts_config
SET valid_to = '2025-12-31'
WHERE valid_from = '2025-01-01' AND valid_to IS NULL
  AND id != (
    SELECT id FROM public.fgts_config
    WHERE valid_from = '2025-01-01' AND valid_to IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  );

NOTIFY pgrst, 'reload schema';
