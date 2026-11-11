/**
 * Curvas do Imovib — puras, sem React nem banco.
 *
 * Item 1.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md.
 * Testes: __tests__/imovibCurvas.test.ts.
 */

export type TipoCurvaDeVendas = 'linear' | 'lancamento' | 'vso' | 'custom';

export interface ParametrosDaCurvaDeVendas {
    tipo: TipoCurvaDeVendas;
    /** Meses de venda. */
    duracao: number;
    /** `lancamento`: percentual do VGV (30 = 30%) vendido nos primeiros `lancamentoMeses`. */
    lancamentoPct?: number;
    lancamentoMeses?: number;
    /** `vso`: percentual do estoque que resta vendido a cada mês (5 = 5%). */
    vsoPct?: number;
    /** `custom`: peso de cada mês, normalizado. */
    pesos?: number[];
}

const iguais = (n: number): number[] => Array.from({ length: n }, () => 1 / n);
const entre0e1 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Fração do VGV vendida em cada mês de venda (índice 0 = 1º mês de venda).
 * Soma 1, exceto na `vso`, que pode deixar estoque: o que sobra NÃO entra na
 * receita (o motor avisa). Prazo ≤ 0 devolve lista vazia.
 */
export function curvaDeVendas(p: ParametrosDaCurvaDeVendas): number[] {
    const n = Math.round(p.duracao);
    if (!(n > 0)) return [];

    switch (p.tipo) {
        case 'lancamento': {
            const meses = Math.min(n, Math.max(0, Math.round(p.lancamentoMeses ?? 0)));
            if (meses === 0) return iguais(n);
            // Lançamento que ocupa o prazo todo: não sobra mês para o resto, então vende tudo ali.
            if (meses === n) return iguais(n);
            const pct = entre0e1((p.lancamentoPct ?? 0) / 100);
            const noLancamento = pct / meses;
            const depois = (1 - pct) / (n - meses);
            return Array.from({ length: n }, (_, i) => (i < meses ? noLancamento : depois));
        }
        case 'vso': {
            const v = entre0e1((p.vsoPct ?? 0) / 100);
            const out: number[] = [];
            let estoque = 1;
            for (let i = 0; i < n; i++) {
                const vendido = estoque * v;
                out.push(vendido);
                estoque -= vendido;
            }
            return out;
        }
        case 'custom': {
            const pesos = Array.from({ length: n }, (_, i) => Math.max(0, Number(p.pesos?.[i]) || 0));
            const total = pesos.reduce((a, b) => a + b, 0);
            if (!(total > 0)) return iguais(n);
            return pesos.map(w => w / total);
        }
        case 'linear':
        default:
            return iguais(n);
    }
}
