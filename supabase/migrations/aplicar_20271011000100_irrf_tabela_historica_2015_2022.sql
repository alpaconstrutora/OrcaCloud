-- Tabela progressiva mensal do IRRF de 04/2015 a 12/2022 (11/10/2026)
--
-- Por quê: o IRRF retido em aluguel (taxPayableService.generateForDeal) calcula
-- pela tabela vigente na data de cada parcela. irrf_brackets só tinha faixas a
-- partir de 2023, então parcela de 2016–2022 (ex.: CTL-006-012-0001, 11/2016 a
-- 04/2019) ficava SEM faixa → IRRF zero → nenhuma linha gerada.
--
-- Valores: Lei 13.149/2015, vigentes de 04/2015 até 04/2023. Aqui só até
-- 31/12/2022 para não sobrepor a linha de 2023 já existente (sobreposição faria
-- getIRRFBrackets devolver duas tabelas para a mesma data).
--
-- ⚠️ Fora do escopo (anotado no plano): as linhas existentes de 2023 e 2024 têm
-- valores do ano seguinte e 01/2024 não tem tabela — a folha usa essas linhas,
-- por isso não foram mexidas aqui.
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`.
-- Idempotente: só insere se ainda não houver faixa com valid_from = 2015-04-01.

INSERT INTO public.irrf_brackets (valid_from, valid_to, min_value, max_value, rate, deduction)
SELECT v.valid_from, v.valid_to, v.min_value, v.max_value, v.rate, v.deduction
  FROM (VALUES
    (DATE '2015-04-01', DATE '2022-12-31', 0.00::numeric,    1903.98::numeric, 0.0000::numeric, 0.00::numeric),
    (DATE '2015-04-01', DATE '2022-12-31', 1903.99,          2826.65,          0.0750,          142.80),
    (DATE '2015-04-01', DATE '2022-12-31', 2826.66,          3751.05,          0.1500,          354.80),
    (DATE '2015-04-01', DATE '2022-12-31', 3751.06,          4664.68,          0.2250,          636.13),
    (DATE '2015-04-01', DATE '2022-12-31', 4664.69,          NULL,             0.2750,          869.36)
  ) AS v(valid_from, valid_to, min_value, max_value, rate, deduction)
 WHERE NOT EXISTS (SELECT 1 FROM public.irrf_brackets WHERE valid_from = DATE '2015-04-01');
