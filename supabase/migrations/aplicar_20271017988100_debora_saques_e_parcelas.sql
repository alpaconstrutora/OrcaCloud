-- ════════════════════════════════════════════════════════════════════════════
-- Dados da Alpa (926cf626…): saques marcados como Débora, recibo nº 000001 e as
-- parcelas do contrato de faxina que têm PIX de exatamente R$ 600.
-- Plano: docs/planos/2026-10-17-recibo-extrato-debora.md (itens 3 e 4).
-- Decisões do usuário em 17/10/2026: contrato segue R$ 600 FIXOS (só concilia o mês
-- com PIX livre de exatamente R$ 600); recibo 000001 = cancelar (estornar a baixa).
--
-- 1) Apelido inválido. Em 01/10/2026 um saque no caixa foi conciliado à mão com a
--    parcela da Débora e a conciliação aprendeu "DINHEIRO ATM CE0230099 MEMO" → Débora.
--    O motor passou a carimbar counterparty_name = Débora em todo saque daquele terminal
--    (47 linhas). O código já não aprende apelido de saque (tokenDeAliasAprendivel).
-- 2) Recibo de pagamento nº 000001: baixa MANUAL da parcela (1) ago/2021 com data
--    28/09/2026, pagamento que não aconteceu nesse dia (os PIX de ago/2021 somam R$ 300).
--    Estorno com a mesma gravação de payableService.updateStatus('PREVISTO'); o gatilho
--    trg_cancelar_recibo_pagamento_no_estorno cancela o recibo (o número não volta).
-- 3) Parcelas em aberto cujo mês tem UM PIX livre de exatamente R$ 600 para o CPF da
--    Débora: fev/2022, mar/2022, nov/2024, dez/2024, mai/2026 — conciliadas por
--    fn_reconcile_match (mesma função da tela, com auditoria).
--
-- Reversão (tabelas *_reversao_20271017 — NÃO apagar):
--   INSERT INTO reconciliation_aliases SELECT * FROM debora_alias_reversao_20271017;
--   UPDATE bank_transactions b SET counterparty_name = r.counterparty_name
--     FROM debora_saques_reversao_20271017 r WHERE r.id = b.id;
--   parcelas: desfazer os vínculos de debora_vinculos_reversao_20271017 pela tela
--   (Desfazer conciliação) ou DELETE em reconciliation_matches + restaurar
--   internal_transactions a partir de debora_titulos_reversao_20271017.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── backups ─────────────────────────────────────────────────────────────────
CREATE TABLE public.debora_alias_reversao_20271017 AS
SELECT * FROM public.reconciliation_aliases
 WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
   AND alias_token = 'DINHEIRO ATM CE0230099 MEMO';

CREATE TABLE public.debora_saques_reversao_20271017 AS
SELECT id, counterparty_name FROM public.bank_transactions
 WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
   AND btrim(counterparty_name) = 'Débora Cristina Duarte'
   AND (description_raw ILIKE 'SAQUE%' OR description_raw ILIKE 'Saque terminal%');

-- Pares parcela × PIX: um PIX livre (sem vínculo) de exatamente R$ 600, único no mês.
CREATE TABLE public.debora_vinculos_reversao_20271017 AS
WITH pix AS (
    SELECT b.id, b.transaction_date, date_trunc('month', b.transaction_date)::date AS mes
      FROM public.bank_transactions b
     WHERE b.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
       AND b.direction = 'DEBIT' AND b.amount = 600
       AND b.description_raw NOT ILIKE 'SAQUE%' AND b.description_raw NOT ILIKE 'Saque terminal%'
       AND (b.description_raw LIKE '%32195297808%' OR b.description_raw ILIKE '%debora%'
            OR b.description_raw ILIKE '%débora%' OR b.description_raw LIKE '%DÃ©bora%')
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = b.id)
), pix_unico AS (
    SELECT mes, min(id::text)::uuid AS bank_id FROM pix GROUP BY mes HAVING count(*) = 1
)
SELECT t.id AS internal_id, p.bank_id, t.due_date
  FROM public.internal_transactions t
  JOIN pix_unico p ON p.mes = date_trunc('month', t.due_date)::date
 WHERE t.contract_id = '5e415c72-4728-4e24-a423-4fb813965499'
   AND t.status = 'PENDING' AND t.amount = 600;

CREATE TABLE public.debora_titulos_reversao_20271017 AS
SELECT * FROM public.internal_transactions
 WHERE id = '6c783055-fc88-4836-a1fa-1fc5ebd696a6'
    OR id IN (SELECT internal_id FROM public.debora_vinculos_reversao_20271017);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['debora_alias_reversao_20271017','debora_saques_reversao_20271017',
                             'debora_vinculos_reversao_20271017','debora_titulos_reversao_20271017'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    END LOOP;
END $$;

DO $$
DECLARE n int; meses text;
BEGIN
    SELECT count(*) INTO n FROM public.debora_alias_reversao_20271017;
    IF n <> 1 THEN RAISE EXCEPTION 'esperava 1 apelido, achei %', n; END IF;

    SELECT count(*) INTO n FROM public.debora_saques_reversao_20271017;
    IF n <> 47 THEN RAISE EXCEPTION 'esperava 47 saques com Débora, achei %', n; END IF;

    SELECT string_agg(to_char(due_date, 'YYYY-MM'), ',' ORDER BY due_date) INTO meses
      FROM public.debora_vinculos_reversao_20271017;
    IF meses IS DISTINCT FROM '2022-02,2022-03,2024-11,2024-12,2026-05' THEN
        RAISE EXCEPTION 'pares parcela×PIX diferentes do conferido: %', meses;
    END IF;
END $$;

-- ── 1) apelido e saques ─────────────────────────────────────────────────────
DELETE FROM public.reconciliation_aliases
 WHERE id IN (SELECT id FROM public.debora_alias_reversao_20271017);

UPDATE public.bank_transactions
   SET counterparty_name = NULL
 WHERE id IN (SELECT id FROM public.debora_saques_reversao_20271017);

-- ── 2) estorno da parcela ago/2021 (cancela o recibo 000001 pelo gatilho) ────
UPDATE public.internal_transactions
   SET business_status = 'PREVISTO', status = 'PENDING', payment_date = NULL, updated_at = now()
 WHERE id = '6c783055-fc88-4836-a1fa-1fc5ebd696a6'
   AND business_status = 'PAGO';

-- ── 3) concilia as 5 parcelas com o PIX do mês ──────────────────────────────
DO $$
DECLARE v record;
BEGIN
    FOR v IN SELECT * FROM public.debora_vinculos_reversao_20271017 ORDER BY due_date LOOP
        PERFORM public.fn_reconcile_match(v.bank_id, v.internal_id, 'MANUAL', 100, NULL);
    END LOOP;
END $$;

-- ── conferência ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM public.financial_receipts
     WHERE transaction_id = '6c783055-fc88-4836-a1fa-1fc5ebd696a6' AND cancelled_at IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'recibo 000001 não foi cancelado'; END IF;

    SELECT count(*) INTO n FROM public.internal_transactions
     WHERE id IN (SELECT internal_id FROM public.debora_vinculos_reversao_20271017)
       AND status = 'CONCILIATED'
       AND (SELECT count(*) FROM public.reconciliation_matches m WHERE m.internal_transaction_id = internal_transactions.id) = 1;
    IF n <> 5 THEN RAISE EXCEPTION 'esperava 5 parcelas conciliadas com 1 vínculo, achei %', n; END IF;

    SELECT count(*) INTO n FROM public.bank_transactions
     WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
       AND btrim(counterparty_name) = 'Débora Cristina Duarte'
       AND (description_raw ILIKE 'SAQUE%' OR description_raw ILIKE 'Saque terminal%');
    IF n <> 0 THEN RAISE EXCEPTION 'sobraram % saques com Débora', n; END IF;
END $$;

COMMIT;
