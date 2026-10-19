-- ════════════════════════════════════════════════════════════════════════════
-- Extrato da conta 001 "Sicredi" (Alpa, ag. 0230 c/c 55883-5) importado TAMBÉM na
-- conta 002 "Sicredi - Garden" (Construção do Edifício Garden Cambuhy SPE).
-- Plano: docs/planos/2026-10-19-boleto-debito-automatico.md (item 3).
-- Decisões do usuário em 19/10/2026: a conta 0230 / 55883-5 é a "Conta código 001";
-- o adiantamento Folha 05/2026 do Rogério foi pago por outro PIX ("sim").
--
-- Três importações da Garden são cópia, linha a linha, de arquivos da 001 — mesmo
-- external_id (FITID), data, valor e direção em TODAS as linhas:
--   2026-05-23 15:10 UTC · 64 linhas · 02/01–26/01/2026
--   2026-05-25 22:31 UTC ·  5 linhas · 01/12–18/12/2025
--   2026-08-11 18:27 UTC · 84 linhas · 01/06–29/06/2026  (o mês inteiro)
-- = 153 linhas, R$ 87.827,93 de débitos e R$ 83.861,49 de créditos contados em dobro.
-- As demais importações da Garden têm ZERO linha igual à 001 e não são tocadas.
-- Prova de que os arquivos são da 001: todo centro de custo das cópias é da Alpa
-- (Administrativo, 007 - Bella Vista, Galeria Altavista - Locações).
--
-- O que faz:
-- 1) Classificação que só a cópia tem passa para a gêmea da 001, SÓ onde a gêmea está
--    vazia (12 categorias, 17 centros de custo). Gêmea NORMALIZED que recebe categoria
--    vira RULE_APPLIED; CONFIRMED da cópia (2 linhas, mesma categoria) passa à gêmea.
-- 2) O vínculo da cópia é desfeito por fn_reconcile_unmatch (a mesma função da tela):
--    o PIX de R$ 648,40 de 18/06/2026 estava pagando DOIS títulos — o adiantamento
--    Folha 04/2026 (pela linha da 001) e o Folha 05/2026 (pela cópia).
-- 3) As 153 cópias são apagadas (as 2 sugestões caem em cascata).
-- 4) O adiantamento Folha 05/2026 (0420c391…, lançado em 20/05) é conciliado, por
--    fn_reconcile_match, com o PIX de R$ 648,40 de 22/05/2026 da própria Garden
--    (47682e75…, importação de 22/06 — não é cópia; estava sem vínculo).
--
-- Reversão (tabelas *_reversao_20271019 — NÃO apagar):
--   passo 4: fn_reconcile_unmatch do vínculo 47682e75… × 0420c391…;
--   bank_transactions: reinserir de extrato_garden_copias_linhas_reversao_20271019
--     (todas as colunas menos _gemea_001_id);
--   INSERT INTO reconciliation_suggestions SELECT * FROM extrato_garden_copias_sugestoes_reversao_20271019;
--   INSERT INTO reconciliation_matches SELECT * FROM extrato_garden_copias_matches_reversao_20271019;
--   UPDATE internal_transactions t SET status = r.status, payment_date = r.payment_date,
--     bank_reconciled_at = r.bank_reconciled_at, payment_account_id = r.payment_account_id
--     FROM extrato_garden_copias_titulos_reversao_20271019 r WHERE r.id = t.id;
--   UPDATE bank_transactions b SET category = r.category, cost_center_id = r.cost_center_id,
--     status = r.status FROM extrato_garden_copias_gemeas_reversao_20271019 r WHERE r.id = b.id;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── as cópias e a gêmea de cada uma ────────────────────────────────────────
CREATE TABLE public.extrato_garden_copias_linhas_reversao_20271019 AS
SELECT g.*, a.id AS _gemea_001_id
  FROM public.bank_transactions g
  JOIN public.bank_transactions a
    ON a.bank_account_id = '3fba3210-3783-4fc1-9e88-ab18a213b4c3'          -- 001 Sicredi (Alpa)
   AND a.external_id = g.external_id AND a.transaction_date = g.transaction_date
   AND a.amount = g.amount AND a.direction = g.direction
 WHERE g.bank_account_id = '91853f74-d48f-4fcc-8893-9e5d63ead19f'          -- 002 Sicredi - Garden
   AND date_trunc('minute', g.created_at) IN ('2026-05-23 15:10:00+00', '2026-05-25 22:31:00+00', '2026-08-11 18:27:00+00');

CREATE TABLE public.extrato_garden_copias_matches_reversao_20271019 AS
SELECT * FROM public.reconciliation_matches
 WHERE bank_transaction_id IN (SELECT id FROM public.extrato_garden_copias_linhas_reversao_20271019);

CREATE TABLE public.extrato_garden_copias_sugestoes_reversao_20271019 AS
SELECT * FROM public.reconciliation_suggestions
 WHERE bank_transaction_id IN (SELECT id FROM public.extrato_garden_copias_linhas_reversao_20271019);

CREATE TABLE public.extrato_garden_copias_titulos_reversao_20271019 AS
SELECT * FROM public.internal_transactions
 WHERE id IN (SELECT internal_transaction_id FROM public.extrato_garden_copias_matches_reversao_20271019);

-- Gêmeas da 001 + a linha do PIX de 22/05 (o status dela muda no passo 4).
CREATE TABLE public.extrato_garden_copias_gemeas_reversao_20271019 AS
SELECT a.id, a.category, a.cost_center_id, a.status
  FROM public.bank_transactions a
 WHERE a.id IN (SELECT _gemea_001_id FROM public.extrato_garden_copias_linhas_reversao_20271019)
    OR a.id = '47682e75-4e86-44cc-abe9-d69e8e4f3f60';

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['extrato_garden_copias_linhas_reversao_20271019','extrato_garden_copias_matches_reversao_20271019',
                             'extrato_garden_copias_sugestoes_reversao_20271019','extrato_garden_copias_titulos_reversao_20271019',
                             'extrato_garden_copias_gemeas_reversao_20271019'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    END LOOP;
END $$;

-- ── conferência ANTES de mexer: o que foi medido em 19/10/2026 ───────────────
DO $$
DECLARE n_linhas int; n_gemeas int; n_vinc int; n_sug int; n_lotes int; n_pix int;
BEGIN
    SELECT count(*), count(DISTINCT _gemea_001_id) INTO n_linhas, n_gemeas FROM public.extrato_garden_copias_linhas_reversao_20271019;
    SELECT count(*) INTO n_vinc FROM public.extrato_garden_copias_matches_reversao_20271019;
    SELECT count(*) INTO n_sug  FROM public.extrato_garden_copias_sugestoes_reversao_20271019;
    -- Cada lote tem de ser cópia INTEIRA: nenhuma linha do lote sem gêmea na 001.
    SELECT count(*) INTO n_lotes FROM public.bank_transactions g
     WHERE g.bank_account_id = '91853f74-d48f-4fcc-8893-9e5d63ead19f'
       AND date_trunc('minute', g.created_at) IN ('2026-05-23 15:10:00+00', '2026-05-25 22:31:00+00', '2026-08-11 18:27:00+00');
    -- O PIX de 22/05: Garden, R$ 648,40, débito, sem vínculo.
    SELECT count(*) INTO n_pix FROM public.bank_transactions b
     WHERE b.id = '47682e75-4e86-44cc-abe9-d69e8e4f3f60'
       AND b.bank_account_id = '91853f74-d48f-4fcc-8893-9e5d63ead19f'
       AND b.transaction_date = '2026-05-22' AND b.amount = 648.40 AND b.direction = 'DEBIT'
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = b.id);
    IF n_linhas <> 153 OR n_gemeas <> 153 OR n_lotes <> 153 OR n_vinc <> 1 OR n_sug <> 2 OR n_pix <> 1 THEN
        RAISE EXCEPTION 'Estado diferente do medido: cópias % (esperado 153), gêmeas distintas % (153), linhas nos lotes % (153), vínculos % (1), sugestões % (2), PIX 22/05 livre % (1)',
            n_linhas, n_gemeas, n_lotes, n_vinc, n_sug, n_pix;
    END IF;
END $$;

-- ── 1) classificação da cópia → gêmea da 001, só onde a gêmea está vazia ─────
UPDATE public.bank_transactions a
   SET category       = COALESCE(a.category, c.category),
       cost_center_id = COALESCE(a.cost_center_id, c.cost_center_id),
       status = CASE
                    WHEN a.status = 'NORMALIZED' AND a.category IS NULL AND c.category IS NOT NULL
                         THEN CASE WHEN c.status = 'CONFIRMED' THEN 'CONFIRMED' ELSE 'RULE_APPLIED' END
                    WHEN a.status = 'RULE_APPLIED' AND c.status = 'CONFIRMED' AND a.category = c.category
                         THEN 'CONFIRMED'
                    ELSE a.status
                END
  FROM public.extrato_garden_copias_linhas_reversao_20271019 c
 WHERE a.id = c._gemea_001_id
   AND ((a.category IS NULL AND c.category IS NOT NULL)
     OR (a.cost_center_id IS NULL AND c.cost_center_id IS NOT NULL)
     OR (a.status = 'RULE_APPLIED' AND c.status = 'CONFIRMED' AND a.category = c.category));

-- ── 2) vínculo da cópia: desfeito pela função da tela ────────────────────────
SELECT public.fn_reconcile_unmatch(m.id) FROM public.extrato_garden_copias_matches_reversao_20271019 m;

-- ── 3) as cópias ─────────────────────────────────────────────────────────────
DELETE FROM public.bank_transactions
 WHERE id IN (SELECT id FROM public.extrato_garden_copias_linhas_reversao_20271019);

-- ── 4) Folha 05/2026 do Rogério × PIX de 22/05/2026 (função da tela) ─────────
SELECT public.fn_reconcile_match('47682e75-4e86-44cc-abe9-d69e8e4f3f60', '0420c391-8639-4233-a000-f14ce11cda17', 'MANUAL', 100, NULL);

-- ── conferência DEPOIS ───────────────────────────────────────────────────────
DO $$
DECLARE n_pares int; n_cat int; n_cc int; t record;
BEGIN
    SELECT count(*) INTO n_pares FROM public.bank_transactions g
      JOIN public.bank_transactions a ON a.bank_account_id = '3fba3210-3783-4fc1-9e88-ab18a213b4c3'
       AND a.external_id = g.external_id AND a.transaction_date = g.transaction_date AND a.amount = g.amount
     WHERE g.bank_account_id = '91853f74-d48f-4fcc-8893-9e5d63ead19f';
    SELECT count(*) FILTER (WHERE a.category IS NULL AND c.category IS NOT NULL),
           count(*) FILTER (WHERE a.cost_center_id IS NULL AND c.cost_center_id IS NOT NULL)
      INTO n_cat, n_cc
      FROM public.extrato_garden_copias_linhas_reversao_20271019 c
      JOIN public.bank_transactions a ON a.id = c._gemea_001_id;
    SELECT it.status, it.payment_date, it.payment_account_id,
           (SELECT count(*) FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id) AS vinculos
      INTO t FROM public.internal_transactions it WHERE it.id = '0420c391-8639-4233-a000-f14ce11cda17';
    IF n_pares <> 0 OR n_cat <> 0 OR n_cc <> 0
       OR t.status IS DISTINCT FROM 'CONCILIATED' OR t.payment_date IS DISTINCT FROM '2026-05-22'::date
       OR t.payment_account_id IS DISTINCT FROM '91853f74-d48f-4fcc-8893-9e5d63ead19f'::uuid OR t.vinculos <> 1 THEN
        RAISE EXCEPTION 'Conferência falhou: pares restantes %, categoria não passada %, CC não passado %, Folha 05 = % / % / % / % vínculo(s)',
            n_pares, n_cat, n_cc, t.status, t.payment_date, t.payment_account_id, t.vinculos;
    END IF;
    RAISE NOTICE 'OK: 153 cópias removidas; classificação passada à 001; Folha 05/2026 do Rogério conciliada com o PIX de 22/05.';
END $$;

COMMIT;
