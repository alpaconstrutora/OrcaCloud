-- Corrige o valor de contratos de LOCAÇÃO que divergem do aluguel efetivamente
-- cobrado nas parcelas.
--
-- Causa: `contracts.original_value` de uma locação é o valor da PARCELA, gravado
-- uma única vez por `createFromDeal`. Com a negociação ainda sem
-- `installment_value`, ele saiu de `value ÷ installments`; quando alguém
-- preencheu o valor mensal depois, nada propagou. Medido em 11/08/2026:
--   CL-2026-005 → contrato dizia 38,88 (= 933 ÷ 24), cobrando 1.100,00/mês
--   CL-2026-004 → contrato dizia 4.346,00, cobrando 3.000,00/mês
--
-- Por que importa: `current_value` é a BASE DO REAJUSTE
-- (novo_valor = current_value × índice_hoje / índice_base). Esses dois estão com
-- `reajuste_proximo` VENCIDO (2021-05-25 e 2023-03-23) — rodar a fila hoje
-- reajustaria 38,88. As parcelas já lançadas têm valor próprio e não mudam.
--
-- TRAVA: só toca contrato SEM reajuste aplicado (current_value = original_value).
-- Com reajuste, a negociação deixou de ser a autoridade sobre o aluguel e
-- sobrescrever apagaria o acumulado — mesma razão pela qual `updateContract` não
-- recalcula `current_value` de contrato recorrente. Em 11/08/2026 os 6 contratos
-- de locação satisfaziam essa condição, mas a trava fica no SQL: se alguém
-- reajustar entre a escrita e a aplicação deste script, aquele contrato sai.
--
-- O valor novo é DERIVADO das parcelas (não digitado à mão): usa o bruto
-- (`original_amount`, que é onde o desconto guarda o valor cheio) e cai em
-- `amount` quando não houve desconto. Exige um único valor bruto na série — série
-- com valores diferentes (reajuste no meio, aditivo) fica de fora, porque aí não
-- existe "o" aluguel do contrato.
--
-- Aplicação: manual, no SQL Editor (padrão `aplicar_*`, fora de
-- `schema_migrations`). Rode o bloco 1, confira, e só então o bloco 2.
-- Plano: docs/planos/2026-08-11-valor-do-contrato-de-locacao-desatualizado.md

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — CONFERÊNCIA (não altera nada). Rode e leia antes do bloco 2.
-- ─────────────────────────────────────────────────────────────────────────────
WITH aluguel_cobrado AS (
    SELECT
        split_part(t.reference_id, '-p', 1)::uuid       AS contract_id,
        min(COALESCE(t.original_amount, t.amount))      AS menor,
        max(COALESCE(t.original_amount, t.amount))      AS maior,
        count(*)                                        AS parcelas
    FROM internal_transactions t
    WHERE t.source_system = 'CONTRACT_RECURRING'
      AND t.reference_id LIKE '%-p%'
    GROUP BY 1
)
SELECT
    c.number,
    c.original_value                        AS valor_no_contrato,
    c.current_value                         AS valor_vigente,
    a.menor                                 AS aluguel_nas_parcelas,
    a.parcelas,
    c.reajuste_proximo,
    CASE
        WHEN a.menor IS DISTINCT FROM a.maior              THEN 'PULADO: série com valores diferentes'
        WHEN c.current_value IS DISTINCT FROM c.original_value THEN 'PULADO: já tem reajuste aplicado'
        WHEN abs(COALESCE(c.original_value, 0) - a.menor) < 0.01 THEN 'OK: já bate'
        ELSE 'SERÁ CORRIGIDO'
    END                                     AS veredito
FROM contracts c
JOIN aluguel_cobrado a ON a.contract_id = c.id
WHERE c.domain = 'LOCACAO'
ORDER BY c.number;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — CORREÇÃO. Só rode depois de conferir o bloco 1.
-- ─────────────────────────────────────────────────────────────────────────────
WITH aluguel_cobrado AS (
    SELECT
        split_part(t.reference_id, '-p', 1)::uuid       AS contract_id,
        min(COALESCE(t.original_amount, t.amount))      AS menor,
        max(COALESCE(t.original_amount, t.amount))      AS maior
    FROM internal_transactions t
    WHERE t.source_system = 'CONTRACT_RECURRING'
      AND t.reference_id LIKE '%-p%'
    GROUP BY 1
)
UPDATE contracts c
SET original_value = a.menor,
    current_value  = a.menor
FROM aluguel_cobrado a
WHERE a.contract_id = c.id
  AND c.domain = 'LOCACAO'
  AND a.menor = a.maior                                  -- série de valor único
  AND a.menor > 0
  AND c.current_value IS NOT DISTINCT FROM c.original_value  -- sem reajuste aplicado
  AND abs(COALESCE(c.original_value, 0) - a.menor) >= 0.01;  -- ainda diverge

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — VERIFICAÇÃO. Deve voltar ZERO linhas.
-- ─────────────────────────────────────────────────────────────────────────────
WITH aluguel_cobrado AS (
    SELECT
        split_part(t.reference_id, '-p', 1)::uuid       AS contract_id,
        min(COALESCE(t.original_amount, t.amount))      AS menor,
        max(COALESCE(t.original_amount, t.amount))      AS maior
    FROM internal_transactions t
    WHERE t.source_system = 'CONTRACT_RECURRING'
      AND t.reference_id LIKE '%-p%'
    GROUP BY 1
)
SELECT c.number, c.original_value, c.current_value, a.menor AS aluguel_nas_parcelas
FROM contracts c
JOIN aluguel_cobrado a ON a.contract_id = c.id
WHERE c.domain = 'LOCACAO'
  AND a.menor = a.maior
  AND c.current_value IS NOT DISTINCT FROM c.original_value
  AND abs(COALESCE(c.original_value, 0) - a.menor) >= 0.01;
