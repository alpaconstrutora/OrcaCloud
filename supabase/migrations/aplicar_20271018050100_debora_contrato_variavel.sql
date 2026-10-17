-- ════════════════════════════════════════════════════════════════════════════
-- Dados da Alpa (926cf626…): contrato de faxina da Débora (5e415c72…) passa a ter
-- valor VARIÁVEL e 15 parcelas em aberto são conciliadas com o PIX do mês.
-- Plano: docs/planos/2026-10-17-contrato-valor-fixo-ou-por-medicao.md (item 6).
-- ⚠️ Depende de aplicar_20271018050000 (coluna installment_value_mode, valor_variavel
--    e fn_reconcile_group aceitando ADJUST_VALUE em parcela variável).
--
-- Decisão do usuário (17/10/2026): aplicar ao contrato da Débora os meses pagos com
-- UM PIX de R$ 750 (14) e 06/2025 com dois PIX (R$ 450 + R$ 150 = R$ 600). Conferido a
-- seco em 17/10. Ficam EM ABERTO para revisão manual: ago/2021 (R$ 300 em 2 PIX),
-- abr/2024 e ago/2024 (R$ 150 cada) e os meses sem PIX.
--
-- R$ 750 → fn_reconcile_group ADJUST_VALUE (a parcela passa a valer R$ 750; o valor
-- anterior fica em reconciliation_audit_log.payload.antes). 06/2025 → EXACT (soma igual).
--
-- Reversão: tabelas debora_variavel_*_reversao_20271017 (NÃO apagar). Desfazer cada
-- vínculo pela tela (Desfazer conciliação), restaurar amount pela tabela de títulos e
-- UPDATE contracts SET installment_value_mode = 'FIXO' WHERE id = '5e415c72-…'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE public.debora_variavel_pares_reversao_20271017 AS
WITH pix AS (
    SELECT b.id, b.amount, b.transaction_date, date_trunc('month', b.transaction_date)::date AS mes
      FROM public.bank_transactions b
     WHERE b.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6' AND b.direction = 'DEBIT'
       AND b.description_raw NOT ILIKE 'SAQUE%' AND b.description_raw NOT ILIKE 'Saque terminal%'
       AND (b.description_raw LIKE '%32195297808%' OR b.description_raw LIKE '%952978%'
            OR b.description_raw ILIKE '%debora%' OR b.description_raw ILIKE '%débora%'
            OR b.description_raw LIKE '%DÃ©bora%')
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = b.id)
), por_mes AS (
    SELECT mes, array_agg(id ORDER BY transaction_date, id) AS bank_ids, sum(amount) AS soma, count(*) AS n
      FROM pix GROUP BY mes
)
SELECT t.id AS internal_id, t.due_date, t.amount AS valor_antes, p.bank_ids, p.soma,
       CASE WHEN p.soma = t.amount THEN 'EXACT' ELSE 'ADJUST_VALUE' END AS modo
  FROM public.internal_transactions t
  JOIN por_mes p ON p.mes = date_trunc('month', t.due_date)::date
 WHERE t.contract_id = '5e415c72-4728-4e24-a423-4fb813965499'
   AND t.status = 'PENDING'
   AND ((p.n = 1 AND p.soma = 750)
        OR (to_char(t.due_date, 'YYYY-MM') = '2025-06' AND p.n = 2 AND p.soma = 600));

CREATE TABLE public.debora_variavel_titulos_reversao_20271017 AS
SELECT * FROM public.internal_transactions
 WHERE id IN (SELECT internal_id FROM public.debora_variavel_pares_reversao_20271017);

CREATE TABLE public.debora_variavel_contrato_reversao_20271017 AS
SELECT id, installment_value_mode FROM public.contracts WHERE id = '5e415c72-4728-4e24-a423-4fb813965499';

DO $$
DECLARE t text; meses text;
BEGIN
    FOREACH t IN ARRAY ARRAY['debora_variavel_pares_reversao_20271017',
                             'debora_variavel_titulos_reversao_20271017',
                             'debora_variavel_contrato_reversao_20271017'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    END LOOP;

    SELECT string_agg(to_char(due_date, 'YYYY-MM'), ',' ORDER BY due_date) INTO meses
      FROM public.debora_variavel_pares_reversao_20271017;
    IF meses IS DISTINCT FROM '2022-07,2022-09,2023-03,2023-05,2023-06,2023-08,2023-11,2024-01,2024-07,2024-10,2025-01,2025-04,2025-06,2025-12,2026-04' THEN
        RAISE EXCEPTION 'meses diferentes do conferido a seco: %', meses;
    END IF;
END $$;

UPDATE public.contracts
   SET installment_value_mode = 'VARIAVEL'
 WHERE id = '5e415c72-4728-4e24-a423-4fb813965499';

DO $$
DECLARE v record;
BEGIN
    FOR v IN SELECT * FROM public.debora_variavel_pares_reversao_20271017 ORDER BY due_date LOOP
        PERFORM public.fn_reconcile_group(v.bank_ids, ARRAY[v.internal_id], v.modo, '{}'::jsonb);
    END LOOP;
END $$;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
      FROM public.internal_transactions t
      JOIN public.debora_variavel_pares_reversao_20271017 p ON p.internal_id = t.id
     WHERE t.status = 'CONCILIATED' AND t.amount = p.soma;
    IF n <> 15 THEN RAISE EXCEPTION 'esperava 15 parcelas conciliadas com o valor do PIX, achei %', n; END IF;
END $$;

COMMIT;
