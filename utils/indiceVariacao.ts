/**
 * Variação de índices econômicos (INCC, IPCA, IGP-M…) — pura.
 *
 * A série vem de `contract_index_values` (número-índice por mês, dia 01). Item
 * 1.7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md: o
 * Imovib sugere a taxa mensal do índice da obra e do índice das vendas pela
 * média da série. Testes: __tests__/indiceVariacao.test.ts.
 */

export interface PontoDoIndice {
    reference_month: string;
    value: number;
}

const mesesEntre = (de: string, ate: string): number => {
    const [a1, m1] = de.slice(0, 7).split('-').map(Number);
    const [a2, m2] = ate.slice(0, 7).split('-').map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
};

/**
 * Taxa média mensal composta, em PERCENTUAL (1 = 1% a.m.), nos últimos `meses`
 * meses da série. Conta os meses pelo calendário (mês faltando no meio não
 * distorce). Menos de dois pontos, ou número-índice ≤ 0: null.
 */
export function taxaMensalMedia(valores: PontoDoIndice[], meses: number): number | null {
    const ordenados = [...valores]
        .filter(v => v?.reference_month && Number.isFinite(Number(v.value)))
        .sort((a, b) => a.reference_month.localeCompare(b.reference_month));
    if (ordenados.length < 2) return null;

    const ultimo = ordenados[ordenados.length - 1];
    // Ponto mais antigo dentro da janela de `meses` meses antes do último.
    const primeiro = ordenados.find(v => mesesEntre(v.reference_month, ultimo.reference_month) <= meses) ?? ordenados[0];
    const n = mesesEntre(primeiro.reference_month, ultimo.reference_month);
    const de = Number(primeiro.value);
    const ate = Number(ultimo.value);
    if (!(n > 0) || !(de > 0) || !(ate > 0)) return null;
    return (Math.pow(ate / de, 1 / n) - 1) * 100;
}
