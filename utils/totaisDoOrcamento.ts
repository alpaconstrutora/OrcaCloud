// Totais de um orçamento a partir dos itens (`projects.budget`).
//
// A conta do KPI "Preço Final" do Orçamento Analítico, num lugar só: o editor e a coluna
// "Valor total" de Engenharia › Orçamentos usam esta função, para os dois números nunca
// divergirem (docs/planos/2026-11-21-orcamentos-colunas.md).
import type { BudgetEntry } from '../types';

type ItemComPreco = Pick<BudgetEntry, 'quantity' | 'bdi'> & { sinapiItem?: { price?: number } | null };

/** Preço final (com BDI): soma de quantidade × preço × (1 + BDI). O BDI do item vence o global. */
export function precoFinalDoOrcamento(
    itens: readonly ItemComPreco[] | null | undefined,
    bdiGlobal: number | null | undefined,
): number {
    return (itens ?? []).reduce(
        (acc, item) => acc + item.quantity * (item.sinapiItem?.price || 0) * (1 + (item.bdi ?? bdiGlobal ?? 0) / 100),
        0,
    );
}
