/**
 * Identidade da unidade de medida — "qual unidade é esta?" (KG, M, BR…).
 *
 * PURO e sem imports: também roda no Deno (Edge Function `pedido-fast`, via
 * `lib/pedidoFast.ts`). Não confundir com `dimensaoDaUnidade`
 * (utils/blueprintBudget.ts), que responde "qual GRANDEZA" e junta PC com UN.
 *
 * Saiu de `lib/pedidoFast.ts` em 21/11/2026 para a equivalência de unidades
 * (docs/planos/2026-11-21-equivalencia-unidades.md) usar o mesmo mapa.
 */
const UNIDADES: Record<string, string> = {
    U: 'UN', UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
    PC: 'PC', 'PÇ': 'PC', PCS: 'PC', 'PÇS': 'PC', PCA: 'PC', PECA: 'PC', 'PEÇA': 'PC',
    KG: 'KG', KGS: 'KG', QUILO: 'KG', G: 'G', GR: 'G',
    M: 'M', MT: 'M', MTS: 'M', METRO: 'M', ML: 'ML',
    M2: 'M2', 'M²': 'M2', M3: 'M3', 'M³': 'M3',
    L: 'L', LT: 'L', LTS: 'L', LITRO: 'L',
    SC: 'SC', SACO: 'SC', CX: 'CX', CAIXA: 'CX', RL: 'RL', ROLO: 'RL',
    BD: 'BD', BALDE: 'BD', GL: 'GL', GALAO: 'GL', 'GALÃO': 'GL', LATA: 'LT', TB: 'TB', BR: 'BR', BARRA: 'BR',
    JG: 'JG', JOGO: 'JG', KIT: 'KIT', PAR: 'PAR', CJ: 'CJ', MIL: 'MIL', MILHEIRO: 'MIL',
};

/** Unidade como o pedido grava: maiúscula, sem ponto; vazia vira UN. */
export function normalizarUnidade(unidade: string | null | undefined): string {
    const limpa = (unidade ?? '').toUpperCase().replace(/[.\s]/g, '');
    if (!limpa) return 'UN';
    return UNIDADES[limpa] ?? limpa.slice(0, 10);
}

/**
 * Para a equivalência: vazio NÃO vira UN (vira null — sem unidade não há
 * conversão), e o resultado cabe no CHECK `^[A-Z0-9]{1,10}$` da tabela.
 */
export function identidadeDaUnidade(unidade: string | null | undefined): string | null {
    if (!(unidade ?? '').trim()) return null;
    const u = normalizarUnidade(unidade);
    return /^[A-Z0-9]{1,10}$/.test(u) ? u : null;
}

/**
 * Unidades que o cadastro de equivalência oferece. ML fica de fora: é metro
 * linear para a planta e mililitro para o pedido — ambíguo.
 */
export const UNIDADES_DE_EQUIVALENCIA: readonly string[] = [
    'M', 'M2', 'M3', 'KG', 'T', 'UN', 'BR', 'PC', 'SC', 'CX', 'RL', 'L', 'CJ', 'PAR', 'JG', 'GL', 'MIL',
];
