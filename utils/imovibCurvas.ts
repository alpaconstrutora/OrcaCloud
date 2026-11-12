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
    distributions: { itemId: string; periodId: string; percentage: number }[];
    itemSchedules?: { id: string; startDate?: string; endDate?: string; inactive?: boolean }[];
}

/** Item do orçamento do planejamento: total = quantidade × preço. */
export interface ItemDoOrcamentoDaObra { id: string; quantity: number; sinapiItem?: { price?: number } | null; }

/** Dia 'AAAA-MM-DD' como número de dias (UTC, sem fuso). */
const diaDe = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
const mesDoDia = (dia: number) => new Date(dia * 86_400_000).toISOString().slice(0, 7);

/**
 * Desembolso mensal de uma ou mais obras em % do total (item 5.4), com a MESMA
 * conta do previsto da FinancialSchedule: o total de cada item (quantidade ×
 * preço) se espalha pelos dias da tarefa (`itemSchedules`, formato novo) ou, sem
 * datas, pelo `percentage` de cada período (formato antigo — o `value` gravado é
 * 0). Tarefa inativa fica fora. Agrupa pelo mês do calendário, do primeiro ao
 * último mês com valor. Sem valor: null.
 */
export function curvaDoCronograma(obras: { schedule: CronogramaDaObra; budget: ItemDoOrcamentoDaObra[] }[]): { percentuais: number[]; primeiroMes: string } | null {
    const porMes = new Map<string, number>();
    const soma = (mes: string, v: number) => porMes.set(mes, (porMes.get(mes) ?? 0) + v);
    for (const { schedule, budget } of obras) {
        const mesDoPeriodo = new Map((schedule?.periods ?? []).map(p => [p.id, String(p.date ?? '').slice(0, 7)]));
        for (const item of budget ?? []) {
            const total = (Number(item.quantity) || 0) * (Number(item.sinapiItem?.price) || 0);
            if (!(total > 0)) continue;
            const tarefa = schedule?.itemSchedules?.find(t => t.id === item.id);
            if (tarefa?.inactive) continue;
            if (tarefa?.startDate && tarefa?.endDate && /^\d{4}-\d{2}-\d{2}/.test(tarefa.startDate) && /^\d{4}-\d{2}-\d{2}/.test(tarefa.endDate)) {
                const ini = diaDe(tarefa.startDate);
                const fim = Math.max(ini, diaDe(tarefa.endDate));
                const porDia = total / (fim - ini + 1);
                for (let d = ini; d <= fim; d++) soma(mesDoDia(d), porDia);
                continue;
            }
            for (const dist of schedule?.distributions ?? []) {
                if (dist.itemId !== item.id) continue;
                const mes = mesDoPeriodo.get(dist.periodId);
                if (mes && /^\d{4}-\d{2}$/.test(mes)) soma(mes, total * (Number(dist.percentage) || 0) / 100);
            }
        }
    }
    for (const [m, v] of porMes) if (!(v > 0)) porMes.delete(m);
    if (porMes.size === 0) return null;
    const meses = [...porMes.keys()].sort();
    const indice = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
    const primeiro = indice(meses[0]);
    const valores = new Array<number>(indice(meses[meses.length - 1]) - primeiro + 1).fill(0);
    porMes.forEach((v, m) => { valores[indice(m) - primeiro] += v; });
    const totalGeral = valores.reduce((a, b) => a + b, 0);
    return { percentuais: valores.map(v => (v / totalGeral) * 100), primeiroMes: meses[0] };
}

export type TipoCurvaDeDesembolso = 'linear' | 'curva_s' | 'custom';

/** Curva S acumulada: 3x² − 2x³ (a mesma de parametricService.generateSCurveData). */
const curvaSAcumulada = (x: number) => 3 * x * x - 2 * x * x * x;

/**
 * Fração do custo de obra paga em cada mês da obra (índice 0 = 1º mês), somando 1
 * (item 5.3 do plano). `custom` recebe os pesos em % (somam 100):
 * - pesos que não somam 100 são distribuídos na proporção e `somaInformada` diz
 *   quanto somavam (o motor avisa); vazios ou zerados caem na linear, com
 *   `somaInformada` 0;
 * - curva com outro número de meses que a obra (prazo mudado na Dinâmica ou pelo
 *   choque do tornado, curva importada do planejamento) é REAMOSTRADA: a forma
 *   acumulada é interpolada no prazo novo, como a curva S; `reamostrada` diz de
 *   quantos meses ela era.
 */
export function curvaDeDesembolso(tipo: TipoCurvaDeDesembolso, duracao: number, pesos?: number[] | null): { pesos: number[]; somaInformada: number | null; reamostrada: number | null } {
    const n = Math.round(duracao);
    if (!(n > 0)) return { pesos: [], somaInformada: null, reamostrada: null };
    if (tipo === 'curva_s') {
        return { pesos: Array.from({ length: n }, (_, i) => curvaSAcumulada((i + 1) / n) - curvaSAcumulada(i / n)), somaInformada: null, reamostrada: null };
    }
    if (tipo === 'custom') {
        const dados = (pesos ?? []).map(x => Math.max(0, Number(x) || 0));
        const m = dados.length;
        const total = dados.reduce((a, b) => a + b, 0);
        if (!(total > 0)) return { pesos: iguais(n), somaInformada: 0, reamostrada: null };
        const somaInformada = Math.abs(total - 100) > 0.01 ? total : null;
        if (m === n) return { pesos: dados.map(x => x / total), somaInformada, reamostrada: null };
        const acumulada = [0];
        dados.forEach(x => acumulada.push(acumulada[acumulada.length - 1] + x / total));
        const F = (x: number) => {
            const pos = x * m;
            const k = Math.min(m - 1, Math.floor(pos));
            return acumulada[k] + (acumulada[k + 1] - acumulada[k]) * (pos - k);
        };
        return { pesos: Array.from({ length: n }, (_, i) => F((i + 1) / n) - F(i / n)), somaInformada, reamostrada: m };
    }
    return { pesos: iguais(n), somaInformada: null, reamostrada: null };
}
