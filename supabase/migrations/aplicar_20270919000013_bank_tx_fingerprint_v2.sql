-- ==========================================================================
-- bank_transactions.fingerprint v2 — SHA-256 de uma cadeia canônica
-- Date: 2026-09-05 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 1.2)
--
-- ⚠️ JÁ APLICADA EM PRODUÇÃO em 05/09/2026, sob o prefixo ANTIGO
--    `aplicar_20270919000010_bank_tx_fingerprint_v2.sql`. Renumerada para 000013
--    porque a frente de tipos de esquadria chegou antes ao 000010
--    (`aplicar_20270919000010_blueprint_opening_types.sql`) — quem chega depois
--    renomeia. NÃO reaplicar: o Bloco 2 apaga linhas e já apagou as 175 de saldo.
--    Estado provado após a aplicação: 10.133 → 9.958 linhas, 9.958 fingerprints de
--    64 chars, 0 `</MEMO>`, 0 linhas de saldo, 0 external_id aleatório, índice
--    único `bank_transactions_account_fingerprint_uq` criado.
-- ==========================================================================
-- CONTEXTO
-- O fingerprint antigo era `btoa("data-valor-memo").substring(0, 32)` — 32 chars de
-- base64 = 24 bytes de TEXTO: cabiam a data, o valor e as primeiras 5–8 letras da
-- descrição. Não é hash. Dois PIX de R$ 16,00 no mesmo dia, um para "REGINALDO" e
-- outro para "EMPORIUM DOS PAES", davam o mesmo fingerprint ("...PAGAMENTO") e o
-- segundo era descartado na importação como duplicata. Em 05/09/2026 havia 45
-- fingerprints por conta com descrições distintas em produção.
--
-- O novo fingerprint é SHA-256 (hex, 64 chars) de:
--
--   bank_account_id | transaction_date | amount (2 casas) | direction | description (trim) | ordinal
--
-- `ordinal` = posição (1..n) entre linhas idênticas da mesma conta, para que dois
-- movimentos realmente iguais sobrevivam. O TypeScript
-- (bankReconciliationService.fingerprintCanonical / generateFingerprint) produz a
-- MESMA cadeia e o MESMO hash — é isso que permite reimportar os extratos antigos e
-- ter só as linhas perdidas inseridas. Vetor de conferência (TS = SQL):
--   '11111111-2222-3333-4444-555555555555|2026-01-28|16.00|DEBIT|PAGAMENTO PIX SICREDI-CX140166  07593144000148 REGINALDO BEN|1'
--   → da9188787ba6c228a4c64644686969e7d8bcf4f55fea8716acd3a563eaccc226
--
-- Cinco blocos, cada um imprime o que fez (RAISE NOTICE). O SQL Editor roda tudo
-- numa transação: erro em qualquer bloco desfaz os anteriores — comportamento desejado.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ⚠️ Rodar ANTES, e guardar no plano, as contagens por conta × mês
--    (scripts/conciliacao-diagnostico-reimportacao.sql).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Bloco 1: texto herdado do parser OFX antigo ─────────────────────────────
-- A regex `<MEMO>(.*)` capturava até o fim da linha e gravava "</MEMO>" dentro da
-- descrição em arquivos OFX 2.x (com tag de fechamento na mesma linha). O parser
-- novo não faz isso; limpar aqui para o hash bater com o da reimportação.
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM public.bank_transactions WHERE description_raw LIKE '%</MEMO>%';
    UPDATE public.bank_transactions
       SET description_raw = regexp_replace(regexp_replace(description_raw, '\s*</MEMO>', '', 'g'), '^\s+|\s+$', '', 'g')
     WHERE description_raw LIKE '%</MEMO>%';
    RAISE NOTICE 'Bloco 1: % descrições com </MEMO> limpas', n;
END $$;

-- ── Bloco 2: linhas de saldo importadas como movimento ──────────────────────
-- "SALDO DO DIA" / "SALDO FINAL" vieram de planilhas e não são dinheiro que se
-- moveu. Se alguma estiver conciliada/confirmada, alguém tomou uma decisão sobre
-- ela: ABORTA para decidir à mão em vez de apagar.
DO $$
DECLARE n int; m int; total numeric; r record;
BEGIN
    SELECT count(*) INTO m FROM public.bank_transactions
     WHERE description_raw ~* '^\s*SALDO (DO DIA|FINAL|ANTERIOR|INICIAL|EM CONTA|ATUAL)\M'
       AND status IN ('MATCHED', 'CONFIRMED', 'LOCKED');
    IF m > 0 THEN
        RAISE EXCEPTION 'ABORTADO: % linhas de saldo estão MATCHED/CONFIRMED/LOCKED — decidir à mão antes de reaplicar.', m;
    END IF;

    SELECT count(*), COALESCE(sum(amount), 0) INTO n, total FROM public.bank_transactions
     WHERE description_raw ~* '^\s*SALDO (DO DIA|FINAL|ANTERIOR|INICIAL|EM CONTA|ATUAL)\M';
    FOR r IN
        SELECT pa.name AS conta, extract(year FROM bt.transaction_date)::int AS ano, count(*) AS qtd
          FROM public.bank_transactions bt
          JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
         WHERE bt.description_raw ~* '^\s*SALDO (DO DIA|FINAL|ANTERIOR|INICIAL|EM CONTA|ATUAL)\M'
         GROUP BY 1, 2 ORDER BY 1, 2
    LOOP
        RAISE NOTICE 'Bloco 2:   % / % → % linhas de saldo', r.conta, r.ano, r.qtd;
    END LOOP;

    DELETE FROM public.bank_transactions
     WHERE description_raw ~* '^\s*SALDO (DO DIA|FINAL|ANTERIOR|INICIAL|EM CONTA|ATUAL)\M';
    RAISE NOTICE 'Bloco 2: % linhas de saldo removidas (soma R$ %)', n, total;
END $$;

-- ── Bloco 3: recalcular TODOS os fingerprints com a cadeia canônica ─────────
DO $$
DECLARE n int;
BEGIN
    WITH ord AS (
        SELECT id,
               row_number() OVER (
                   PARTITION BY bank_account_id, transaction_date, amount, direction,
                                regexp_replace(description_raw, '^\s+|\s+$', '', 'g')
                   ORDER BY created_at, id
               ) AS ordinal
          FROM public.bank_transactions
    )
    UPDATE public.bank_transactions b
       SET fingerprint = encode(sha256(convert_to(
               b.bank_account_id::text
               || '|' || b.transaction_date::text
               || '|' || trim(to_char(b.amount, 'FM9999999999990.00'))
               || '|' || b.direction
               || '|' || regexp_replace(b.description_raw, '^\s+|\s+$', '', 'g')
               || '|' || ord.ordinal::text,
           'UTF8')), 'hex')
      FROM ord
     WHERE ord.id = b.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 3: % fingerprints recalculados', n;
END $$;

-- ── Bloco 4: identificadores aleatórios viram NULL ──────────────────────────
-- CSV/XLSX/CNAB sem FITID recebiam `ext-`/`csv-`/`xlsx-` + Math.random(): 5.226
-- linhas (52%) com um "identificador" que não identifica nada. O UNIQUE
-- (bank_account_id, external_id) aceita NULLs repetidos; a dedupe é pelo fingerprint.
DO $$
DECLARE n int;
BEGIN
    UPDATE public.bank_transactions SET external_id = NULL
     WHERE external_id ~ '^(ext|csv|xlsx|240|400)-';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 4: % external_id aleatórios anulados', n;
END $$;

-- ── Bloco 5: a regra passa a valer no banco, não só no cliente ──────────────
-- Falha se ainda houver colisão — é o comportamento desejado: significa que o
-- backfill não separou duas linhas e alguém precisa olhar.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_account_fingerprint_uq
    ON public.bank_transactions (bank_account_id, fingerprint);

COMMENT ON COLUMN public.bank_transactions.fingerprint IS
    'SHA-256 hex de bank_account_id|transaction_date|amount(2 casas)|direction|description_raw(trim)|ordinal. Mesma cadeia em bankReconciliationService.fingerprintCanonical. Único por conta.';
