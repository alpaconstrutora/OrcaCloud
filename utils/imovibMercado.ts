/**
 * Comparáveis de mercado do estudo (item 7.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Puro.
 * Testes: __tests__/imovibMercado.test.ts.
 */

/** Empreendimento concorrente (tabela imovib_market_comparables, migration aplicar_20271112300000). */
export interface ImovibComparable {
    id: string;
    study_id: string;
    name: string;
    developer?: string | null;
    address?: string | null;
    distance_km?: number | null;
    /** 'AAAA-MM-DD'. */
    launch_date?: string | null;
    total_units?: number | null;
    sold_units?: number | null;
    typical_area?: number | null;
    price_sqm?: number | null;
    ticket?: number | null;
    source?: string | null;
    collected_at?: string | null;
    notes?: string | null;
    sort_order?: number;
    created_at?: string;
}

export interface ResumoDosComparaveis {
    n: number;
    /** R$/m², ponderado pelo total de unidades; média simples se algum com preço não tem total. */
    precoM2Medio: number | null;
    mediaDoPreco: 'ponderada' | 'simples' | null;
    /**
     * % ao mês, média simples da VSO de cada um SOBRE O ESTOQUE — a mesma definição da
     * curva VSO (decisão do usuário de 12/11/2026): 1 − (1 − vendidas/total)^(1/meses).
     * A curva VSO com esse número vende, nos mesmos meses, o que o comparável vendeu.
     */
    vsoMediaMensal: number | null;
    /** Unidades ainda à venda (total − vendidas) dos que têm os dois. */
    estoque: number;
    /** Comparáveis fora da VSO: lançamento depois de hoje, ou todas as unidades vendidas. */
    foraDaVso: { lancamentoFuturo: number; esgotado: number };
}

/** Meses entre o mês do lançamento e o mês de hoje (texto 'AAAA-MM', sem fuso); negativo = lança depois. */
const mesesDesde = (lancamento: string, hoje: string): number | null => {
    const l = /^(\d{4})-(\d{2})/.exec(lancamento);
    const h = /^(\d{4})-(\d{2})/.exec(hoje);
    if (!l || !h) return null;
    return (Number(h[1]) * 12 + Number(h[2])) - (Number(l[1]) * 12 + Number(l[2]));
};

export function resumoDosComparaveis(lista: ImovibComparable[], hoje: string): ResumoDosComparaveis {
    const comPreco = lista.filter(c => (Number(c.price_sqm) || 0) > 0);
    const todosComTotal = comPreco.every(c => (Number(c.total_units) || 0) > 0);
    let precoM2Medio: number | null = null;
    if (comPreco.length) {
        if (todosComTotal) {
            const unidades = comPreco.reduce((a, c) => a + Number(c.total_units), 0);
            precoM2Medio = comPreco.reduce((a, c) => a + Number(c.price_sqm) * Number(c.total_units), 0) / unidades;
        } else {
            precoM2Medio = comPreco.reduce((a, c) => a + Number(c.price_sqm), 0) / comPreco.length;
        }
    }

    const vsos: number[] = [];
    const foraDaVso = { lancamentoFuturo: 0, esgotado: 0 };
    let estoque = 0;
    for (const c of lista) {
        const total = Number(c.total_units) || 0;
        const vendidas = c.sold_units == null ? null : Number(c.sold_units);
        if (total > 0 && vendidas != null) estoque += Math.max(0, total - vendidas);
        const meses = c.launch_date ? mesesDesde(c.launch_date, hoje) : null;
        if (!(total > 0) || vendidas == null || meses == null) continue;
        if (meses < 0) { foraDaVso.lancamentoFuturo++; continue; }
        // Esgotado: a VSO sobre o estoque não é definida (vendeu tudo em algum mês antes de hoje).
        if (vendidas >= total) { foraDaVso.esgotado++; continue; }
        vsos.push((1 - Math.pow(1 - Math.max(0, vendidas) / total, 1 / Math.max(1, meses))) * 100);
    }

    return {
        n: lista.length,
        precoM2Medio,
        mediaDoPreco: precoM2Medio == null ? null : todosComTotal ? 'ponderada' : 'simples',
        vsoMediaMensal: vsos.length ? vsos.reduce((a, b) => a + b, 0) / vsos.length : null,
        estoque,
        foraDaVso,
    };
}

/** % do preço do estudo acima (+) ou abaixo (−) da média dos comparáveis; null sem média. */
export function posicaoDoPreco(precoDoEstudo: number, resumo: ResumoDosComparaveis): number | null {
    if (!resumo.precoM2Medio || !(precoDoEstudo > 0)) return null;
    return (precoDoEstudo / resumo.precoM2Medio - 1) * 100;
}
