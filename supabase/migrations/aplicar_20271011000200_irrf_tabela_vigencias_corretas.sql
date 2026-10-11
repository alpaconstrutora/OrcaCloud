-- IRRF: vigências corretas da tabela progressiva mensal (11/10/2026)
--
-- Antes: a linha "2023" tinha os valores de 02/2024 (isenção 2.259,20), a
-- "2024" (desde 02/2024) os de 05/2025 (isenção 2.428,80), 01/2024 não tinha
-- tabela nenhuma e 2026 estava duplicado (uma cópia até 31/12, outra aberta).
-- A folha de pagamento e o IRRF retido em aluguel calculam pela data → usavam
-- a tabela errada.
--
-- Depois (uma tabela por data, sem sobreposição):
--   2015-04-01 .. 2023-04-30  Lei 13.149/2015   isenção até 1.903,98
--   2023-05-01 .. 2024-01-31  MP 1.171/2023     isenção até 2.112,00
--   2024-02-01 .. 2025-04-30  MP 1.206/2024     isenção até 2.259,20
--   2025-05-01 .. 2025-12-31  MP 1.294/2025     isenção até 2.428,80
--   2026-01-01 .. (aberta)    mesma de 05/2025  (o redutor da Lei 15.270 é aplicado no código)
--
-- ⚠️ Reversão: public.irrf_brackets_reversao_20261011 guarda TODAS as linhas de
-- antes. Voltar: DELETE FROM irrf_brackets; INSERT INTO irrf_brackets SELECT
-- id, valid_from, valid_to, min_value, max_value, rate, deduction, created_at
-- FROM irrf_brackets_reversao_20261011. NÃO APAGAR.
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`.
-- Idempotente: só age se ainda não existe a vigência 2023-05-01.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.irrf_brackets WHERE valid_from = DATE '2023-05-01') THEN
        RAISE NOTICE 'Tabela de IRRF já corrigida — nada a fazer.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS public.irrf_brackets_reversao_20261011 AS
        SELECT * FROM public.irrf_brackets;
    ALTER TABLE public.irrf_brackets_reversao_20261011 ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.irrf_brackets_reversao_20261011 FROM PUBLIC, anon, authenticated;
    COMMENT ON TABLE public.irrf_brackets_reversao_20261011 IS
        'Reversão (11/10/2026): irrf_brackets antes da correção de vigências (aplicar_20271011000200). NÃO APAGAR.';

    -- Lei 13.149/2015 vale até 30/04/2023.
    UPDATE public.irrf_brackets SET valid_to = DATE '2023-04-30'
     WHERE valid_from = DATE '2015-04-01';

    -- Linhas com valores do ano seguinte + a cópia duplicada de 2026.
    DELETE FROM public.irrf_brackets
     WHERE valid_from IN (DATE '2023-01-01', DATE '2024-02-01', DATE '2025-01-01')
        OR (valid_from = DATE '2026-01-01' AND valid_to = DATE '2026-12-31');

    INSERT INTO public.irrf_brackets (valid_from, valid_to, min_value, max_value, rate, deduction) VALUES
        -- MP 1.171/2023
        (DATE '2023-05-01', DATE '2024-01-31', 0.00,    2112.00, 0.0000, 0.00),
        (DATE '2023-05-01', DATE '2024-01-31', 2112.01, 2826.65, 0.0750, 158.40),
        (DATE '2023-05-01', DATE '2024-01-31', 2826.66, 3751.05, 0.1500, 370.40),
        (DATE '2023-05-01', DATE '2024-01-31', 3751.06, 4664.68, 0.2250, 651.73),
        (DATE '2023-05-01', DATE '2024-01-31', 4664.69, NULL,    0.2750, 884.96),
        -- MP 1.206/2024
        (DATE '2024-02-01', DATE '2025-04-30', 0.00,    2259.20, 0.0000, 0.00),
        (DATE '2024-02-01', DATE '2025-04-30', 2259.21, 2826.65, 0.0750, 169.44),
        (DATE '2024-02-01', DATE '2025-04-30', 2826.66, 3751.05, 0.1500, 381.44),
        (DATE '2024-02-01', DATE '2025-04-30', 3751.06, 4664.68, 0.2250, 662.77),
        (DATE '2024-02-01', DATE '2025-04-30', 4664.69, NULL,    0.2750, 896.00),
        -- MP 1.294/2025 (Lei 15.191/2025)
        (DATE '2025-05-01', DATE '2025-12-31', 0.00,    2428.80, 0.0000, 0.00),
        (DATE '2025-05-01', DATE '2025-12-31', 2428.81, 2826.65, 0.0750, 182.16),
        (DATE '2025-05-01', DATE '2025-12-31', 2826.66, 3751.05, 0.1500, 394.16),
        (DATE '2025-05-01', DATE '2025-12-31', 3751.06, 4664.68, 0.2250, 675.49),
        (DATE '2025-05-01', DATE '2025-12-31', 4664.69, NULL,    0.2750, 908.73);
END $$;
