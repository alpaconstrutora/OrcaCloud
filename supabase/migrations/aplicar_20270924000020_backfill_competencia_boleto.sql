-- ============================================================================
-- Backfill: `transaction_date` dos títulos de boleto passa a ser o vencimento
-- Plano: docs/planos/2026-09-24-backfill-competencia-boleto.md (item B)
--
-- ── O que isto corrige ──────────────────────────────────────────────────────
-- Até 24/09/2026 o título nascia com `transaction_date = hoje` — o dia da
-- APROVAÇÃO do boleto, não a data do documento (corrigido no código em
-- `bd4d39b`). Como a aprovação costuma ser em lote e meses depois da captura,
-- 528 dos 634 títulos ficaram com a data errada.
--
-- ── ⚠️ O QUE ESTA MIGRATION FAZ COM A CONTABILIDADE ────────────────────────
-- Ela MOVE COMPETÊNCIA. Medido antes de aplicar, e aprovado pelo usuário em
-- 24/09/2026 depois de ver os números:
--
--   exercício 2026 ................. −R$ 514.138,61  (sai)
--   exercício 2020 ................. +R$ 209.294,59  (79 títulos)
--   exercício 2017 ................. +R$ 147.410,01  (108 títulos)
--   exercício 2016 ................. + R$ 55.735,63  (58 títulos)
--   2014-15, 2018-19, 2021-25, 2028   +R$ 101.697,91
--
-- São 527 títulos, R$ 532.935,18, espalhando-se por 13 exercícios — doze deles
-- ENCERRADOS. DRE e balancete de todos eles mudam.
--
-- ── O que NÃO quebra ────────────────────────────────────────────────────────
-- A conciliação bancária. `reconciliation_matches` liga por
-- `internal_transaction_id`, não por data: os 415 títulos já conciliados
-- mantêm o vínculo, e `payment_date` não é tocado.
--
-- ── Reversível ──────────────────────────────────────────────────────────────
-- O BLOCO 2 grava a data ANTERIOR de cada título antes de qualquer UPDATE. O
-- script de reversão está no fim do arquivo. Sem isso, um `UPDATE` em 527
-- linhas de competência financeira seria caminho sem volta.
--
-- ── Idempotente ─────────────────────────────────────────────────────────────
-- O BLOCO 2 só registra o que ainda não registrou, e o BLOCO 3 só atualiza o
-- que está registrado e ainda não foi movido. Rodar duas vezes não faz nada na
-- segunda.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a tabela de reversão ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.boleto_backfill_competencia_20270924 (
    internal_transaction_id  UUID PRIMARY KEY
        REFERENCES public.internal_transactions(id) ON DELETE CASCADE,
    organization_id          UUID        NOT NULL,
    transaction_date_antes   DATE        NOT NULL,
    transaction_date_depois  DATE        NOT NULL,
    amount                   NUMERIC,
    registrado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    aplicado_em              TIMESTAMPTZ
);

COMMENT ON TABLE public.boleto_backfill_competencia_20270924 IS
  'Foto do `transaction_date` ANTES do backfill de 24/09/2026, que moveu 527 '
  'títulos de boleto para a data de vencimento. Existe para o backfill ser '
  'reversível: ele muda competência contábil em 13 exercícios. Não apagar sem '
  'decisão explícita — é o único registro do estado anterior.';

-- RLS ligada e SEM policy: esta é tabela de operação, não de produto. Ninguém
-- autenticado precisa lê-la pelo PostgREST; quem opera a reversão usa a
-- conexão administrativa. RLS ligada sem policy = ninguém passa, que é o
-- default seguro (REGRA #7, pergunta 1: nenhuma perna do OR libera sozinha
-- porque não há OR nenhum).
ALTER TABLE public.boleto_backfill_competencia_20270924 ENABLE ROW LEVEL SECURITY;

-- ═══ BLOCO 2 — gravar o estado anterior (NÃO altera nada ainda) ═════════════
SET lock_timeout = '5s';

INSERT INTO public.boleto_backfill_competencia_20270924
       (internal_transaction_id, organization_id, transaction_date_antes, transaction_date_depois, amount)
SELECT t.id, t.organization_id, t.transaction_date, t.due_date, t.amount
  FROM public.internal_transactions t
 WHERE t.source_system = 'BOLETO'
   AND t.due_date IS NOT NULL
   AND t.transaction_date <> t.due_date
   -- Janela de plausibilidade — a MESMA de `vencimentoPlausivel`
   -- (utils/febrabanRules.ts). Deixa de fora o boleto com vencimento
   -- `20023-09-21` (ano de cinco dígitos), que não pode virar competência de
   -- coisa nenhuma: ele precisa ser corrigido à mão antes.
   AND t.due_date BETWEEN DATE '1997-10-07' AND (CURRENT_DATE + INTERVAL '5 years')
ON CONFLICT (internal_transaction_id) DO NOTHING;

-- Conferência do bloco 2 (rodar sozinho). Esperado: 527 linhas, aplicado_em nulo.
-- SELECT count(*) AS registrados, count(aplicado_em) AS ja_aplicados
--   FROM public.boleto_backfill_competencia_20270924;

-- ═══ BLOCO 3 — o UPDATE ═════════════════════════════════════════════════════
-- Rodar SÓ depois de conferir o bloco 2.
SET lock_timeout = '10s';

WITH movidos AS (
    UPDATE public.internal_transactions t
       SET transaction_date = b.transaction_date_depois
      FROM public.boleto_backfill_competencia_20270924 b
     WHERE b.internal_transaction_id = t.id
       AND b.aplicado_em IS NULL
       -- Trava contra aplicar sobre um estado que mudou depois do registro:
       -- se alguém editou a data entre o bloco 2 e o 3, a linha fica de fora
       -- em vez de sobrescrever o trabalho alheio.
       AND t.transaction_date = b.transaction_date_antes
    RETURNING t.id
)
UPDATE public.boleto_backfill_competencia_20270924 b
   SET aplicado_em = NOW()
  FROM movidos m
 WHERE b.internal_transaction_id = m.id;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: a_corrigir=0 (fora o de vencimento implausível), aplicados=527.
--
-- SELECT
--   (SELECT count(*) FROM public.internal_transactions
--     WHERE source_system='BOLETO' AND due_date IS NOT NULL
--       AND transaction_date <> due_date
--       AND due_date BETWEEN DATE '1997-10-07' AND CURRENT_DATE + INTERVAL '5 years')
--                                                            AS ainda_divergentes,
--   (SELECT count(*) FROM public.boleto_backfill_competencia_20270924
--     WHERE aplicado_em IS NOT NULL)                          AS aplicados,
--   (SELECT count(*) FROM public.internal_transactions t
--      JOIN public.cost_centers_v2 cc ON cc.id = t.cost_center_id
--     WHERE cc.empreendimento_id IS NOT NULL AND t.direction='DEBIT'
--       AND t.due_date IS NOT NULL
--       AND to_char(t.transaction_date,'YYYY-MM') <> to_char(t.due_date,'YYYY-MM'))
--                                                            AS condominio_fora_do_mes;

-- ═══ REVERSÃO ═══════════════════════════════════════════════════════════════
-- Devolve os 527 títulos à data anterior. Só funciona enquanto a tabela de
-- reversão existir — por isso ela não é descartável.
--
-- WITH voltando AS (
--     UPDATE public.internal_transactions t
--        SET transaction_date = b.transaction_date_antes
--       FROM public.boleto_backfill_competencia_20270924 b
--      WHERE b.internal_transaction_id = t.id
--        AND b.aplicado_em IS NOT NULL
--        AND t.transaction_date = b.transaction_date_depois
--     RETURNING t.id
-- )
-- UPDATE public.boleto_backfill_competencia_20270924 b
--    SET aplicado_em = NULL
--   FROM voltando v
--  WHERE b.internal_transaction_id = v.id;
