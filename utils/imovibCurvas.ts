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

/** O que a curva do planejamento lê do cronograma físico-financeiro (`projects.settings.schedule`). */
export interface CronogramaDaObra {
    periods: { id: string; date: string }[];
    distributions: { periodId: string; value: number }[];
}

/**
 * Desembolso mensal de uma ou mais obras em % do total (item 5.4): soma o VALOR
 * de cada período — `percentage` é o % de cada item, não do total — e agrupa pelo
 * mês do calendário ('AAAA-MM'), do primeiro ao último mês com valor. Sem valor: null.
 */
export function curvaDoCronograma(cronogramas: CronogramaDaObra[]): { percentuais: number[]; primeiroMes: string } | null {
    const porMes = new Map<string, number>();
    for (const c of cronogramas) {
        const mesDoPeriodo = new Map((c.periods ?? []).map(p => [p.id, String(p.date ?? '').slice(0, 7)]));
        for (const d of c.distributions ?? []) {
            const mes = mesDoPeriodo.get(d.periodId);
            const v = Number(d.value) || 0;
            if (!mes || !/^\d{4}-\d{2}$/.test(mes) || v <= 0) continue;
            porMes.set(mes, (porMes.get(mes) ?? 0) + v);
        }
    }
    if (porMes.size === 0) return null;
    const meses = [...porMes.keys()].sort();
    const indice = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
    const primeiro = indice(meses[0]);
    const valores = new Array<number>(indice(meses[meses.length - 1]) - primeiro + 1).fill(0);
    porMes.forEach((v, m) => { valores[indice(m) - primeiro] += v; });
    const total = valores.reduce((a, b) => a + b, 0);
    return { percentuais: valores.map(v => (v / total) * 100), primeiroMes: meses[0] };
}

export type TipoCurvaDeDesembolso = 'linear' | 'curva_s' | 'custom';

/** Curva S acumulada: 3x² − 2x³ (a mesma de parametricService.generateSCurveData). */
const curvaSAcumulada = (x: number) => 3 * x * x - 2 * x * x * x;

/**
 * Fração do custo de obra paga em cada mês da obra (índice 0 = 1º mês), somando 1
 * (item 5.3 do plano). `custom` recebe os pesos em % (somam 100); só os primeiros
 * `duracao` contam e falta vira 0. Pesos que não somam 100 são distribuídos na
 * proporção e `somaInformada` diz quanto somavam (o motor avisa); vazios ou
 * zerados caem na linear.
 */
export function curvaDeDesembolso(tipo: TipoCurvaDeDesembolso, duracao: number, pesos?: number[] | null): { pesos: number[]; somaInformada: number | null } {
    const n = Math.round(duracao);
    if (!(n > 0)) return { pesos: [], somaInformada: null };
    if (tipo === 'curva_s') {
        return { pesos: Array.from({ length: n }, (_, i) => curvaSAcumulada((i + 1) / n) - curvaSAcumulada(i / n)), somaInformada: null };
    }
    if (tipo === 'custom') {
        const w = Array.from({ length: n }, (_, i) => Math.max(0, Number(pesos?.[i]) || 0));
        const total = w.reduce((a, b) => a + b, 0);
        if (total > 0) return { pesos: w.map(x => x / total), somaInformada: Math.abs(total - 100) > 0.01 ? total : null };
    }
    return { pesos: iguais(n), somaInformada: null };
}
