-- ============================================================================
-- Duas correções pontuais, rescaldo do backfill de competência
-- Plano: docs/planos/2026-09-24-backfill-competencia-boleto.md
--
-- O backfill de `aplicar_20270924000020` deixou dois itens declarados como
-- pendentes de decisão. O usuário decidiu em 24/09/2026: "pode fazer você
-- mesmo" e "pode corrigir".
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — o boleto 107, com o ano de cinco dígitos ═════════════════════
--
-- `vencimento = 20023-09-21`. Era a ÚNICA despesa de condomínio fora do mês do
-- vencimento depois do backfill, e a única linha que o backfill deixou de fora
-- de propósito: ano de cinco dígitos não pode virar competência de nada.
--
-- ── Por que 2023-09-21, e por que isso é seguro ────────────────────────────
-- O documento é uma DANF3E da ENERGISA (nota de energia elétrica), sem linha
-- digitável — daí `metodo_extracao: pdf_text` e `confidence_score: 0`. O texto
-- extraído tem exatamente três datas: 11/09/2023, 11/07/2023 e 10/08/2023, e
-- NENHUMA delas é 21/09. Ou seja, a data foi digitada, não extraída.
--
-- A correção é mecânica, não um palpite sobre o documento: `20023` → `2023`,
-- tirando o zero a mais, preservando dia e mês. E o resultado cai na mesma
-- COMPETÊNCIA que a data do próprio documento (11/09/2023): setembro/2023.
-- Para efeito de competência — que é o que o rateio e o DRE usam — os dois
-- valores dizem a mesma coisa.
--
-- O dia (21 contra 11) fica como está: mexer nele seria escolher por quem
-- digitou, sem base no documento.

SET lock_timeout = '5s';

UPDATE public.boletos
   SET vencimento = DATE '2023-09-21'
 WHERE id = 'ca89cebe-7e3b-4d44-b7c0-1c1b920008ae'
   AND vencimento = DATE '20023-09-21';   -- idempotente: 2ª execução não faz nada

-- O título que nasceu dele seguia em 23/08/2026, porque o backfill o excluiu.
-- Agora que a data do boleto é plausível, ele entra na mesma regra dos outros
-- 527: `transaction_date = vencimento`. Registrado na MESMA tabela de reversão
-- do backfill, para a volta ser uma só.
INSERT INTO public.boleto_backfill_competencia_20270924
       (internal_transaction_id, organization_id, transaction_date_antes, transaction_date_depois, amount, aplicado_em)
SELECT t.id, t.organization_id, t.transaction_date, DATE '2023-09-21', t.amount, NOW()
  FROM public.internal_transactions t
 WHERE t.source_system = 'BOLETO'
   AND t.reference_id = 'ca89cebe-7e3b-4d44-b7c0-1c1b920008ae'
   AND t.transaction_date <> DATE '2023-09-21'
ON CONFLICT (internal_transaction_id) DO NOTHING;

UPDATE public.internal_transactions
   SET transaction_date = DATE '2023-09-21',
       due_date         = DATE '2023-09-21'
 WHERE source_system = 'BOLETO'
   AND reference_id = 'ca89cebe-7e3b-4d44-b7c0-1c1b920008ae'
   AND transaction_date <> DATE '2023-09-21';

-- ═══ BLOCO 2 — o rascunho de rateio que o backfill desmontou ════════════════
--
-- Rateio `c49b4cdd-…` — 010 Galeria Altavista, competência 08/2026, RASCUNHO.
-- Ele tinha 14 despesas somando R$ 1.144,95, todas com data de agosto. Depois
-- do backfill essas despesas voltaram para os meses reais delas e se
-- espalharam por 14 meses (04/2020 a 01/2028): só UMA continua em agosto.
-- O `total_despesas` gravado deixou de corresponder a mês nenhum.
--
-- Cancelar é seguro e é o caminho do próprio módulo: ele não tem número
-- (`number` nulo — número só nasce no fechamento), não gerou cobrança
-- (`cobranca_gerada_em` nulo) e nenhuma das 12 cotas virou recebível. Nada sai
-- do lugar; o histórico continua visível como CANCELADO.
--
-- ⚠️ O rateio novo NÃO é criado aqui. Ele nasce pela tela (Novo rateio →
-- Calcular → Salvar), que roda `previa()` e `salvar()` de verdade — incluindo
-- a distribuição em centavos por maior resto, que tem teste próprio
-- (`__tests__/condominioRateio.test.ts`). Reimplementar isso em SQL seria
-- duplicar a regra de negócio no lugar mais difícil de conferir.

SET lock_timeout = '5s';

UPDATE public.condominio_rateios
   SET status = 'CANCELADO'
 WHERE id = 'c49b4cdd-2c6d-475c-b37c-f78e5d5b4c76'
   AND status = 'RASCUNHO'
   AND number IS NULL              -- nunca foi fechado
   AND cobranca_gerada_em IS NULL; -- nunca virou cobrança

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: venc_absurdo=0, condominio_fora_do_mes=0, rascunhos_vivos=0.
--
-- SELECT
--   (SELECT count(*) FROM public.boletos
--     WHERE vencimento > CURRENT_DATE + INTERVAL '50 years')            AS venc_absurdo,
--   (SELECT count(*) FROM public.internal_transactions t
--      JOIN public.cost_centers_v2 cc ON cc.id = t.cost_center_id
--     WHERE cc.empreendimento_id IS NOT NULL AND t.direction = 'DEBIT'
--       AND t.due_date IS NOT NULL
--       AND to_char(t.transaction_date,'YYYY-MM') <> to_char(t.due_date,'YYYY-MM'))
--                                                                        AS condominio_fora_do_mes,
--   (SELECT count(*) FROM public.condominio_rateios WHERE status = 'RASCUNHO') AS rascunhos_vivos;
