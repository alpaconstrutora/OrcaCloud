-- Reajuste acumulado do contrato NÃO recorrente (09/11/2026, PR #275).
--
-- `current_value` de contrato não recorrente é recalculado como
-- original_value + Σ aditivos aprovados — no "Salvar" do contrato (o formulário
-- manda o Valor Original sempre) e na aprovação de aditivo. O reajuste, que só
-- escrevia em current_value, sumia no primeiro desses dois. Agora ele mora aqui
-- e entra na soma (utils/reajusteParcelado.ts › valorAtualDoContrato).
--
-- Contrato RECORRENTE não usa a coluna: lá current_value é o aluguel vigente.
--
-- Sem backfill: em 09/11/2026 nenhum contrato não recorrente tinha reajuste
-- aplicado (o único com current_value ≠ original_value, CTS-042-0001, é
-- exatamente original + aditivos: 2700 + 150).

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS reajuste_acumulado numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.contracts.reajuste_acumulado IS
    'Quanto os reajustes somaram ao contrato não recorrente (applyReajuste). current_value = original_value + Σ aditivos aprovados + reajuste_acumulado. Não usado em contrato recorrente.';
