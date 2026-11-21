/**
 * Informe de rendimentos do investidor por ano-calendário (Fase B5 do plano
 * docs/planos/2026-11-21-portal-do-investidor-consolidacao.md). Uma conta para o portal (PortalFiscal) e para o
 * gestor (TaxReport). Antes as duas telas diziam "Ano-calendário 2025" e somavam TODAS as movimentações.
 *
 * Do jeito que a declaração pede:
 *  - rendimentos = dividendos + distribuições LIQUIDADOS com pagamento DENTRO do ano;
 *  - custo de aquisição = posição em 31/12 (aportes liquidados até essa data, menos retiradas), com a posição
 *    em 31/12 do ano anterior ao lado (Bens e Direitos pede as duas).
 * Lançamento liquidado sem data de pagamento não entra em ano nenhum — a tela diz quantos são.
 */
export interface LancamentoDoInforme {
    project_id: string;
    type: string;
    amount: number | string;
    status: string;
    paid_date?: string | null;
}

export interface LinhaDoInforme { projectId: string; nome: string; custoAnterior: number; custoAtual: number; rendimentos: number }

export interface InformeDoAno {
    ano: number;
    linhas: LinhaDoInforme[];
    custoAnterior: number;
    custoAtual: number;
    rendimentos: number;
    /** Liquidados sem data de pagamento: fora do informe. */
    semData: number;
}

/** Anos com movimento liquidado, do mais recente ao mais antigo (para o seletor). */
export function anosComMovimento(lancamentos: LancamentoDoInforme[]): number[] {
    const anos = new Set<number>();
    for (const l of lancamentos) {
        if (l.status === 'liquidado' && l.paid_date) anos.add(Number(l.paid_date.slice(0, 4)));
    }
    return [...anos].filter(Number.isFinite).sort((a, b) => b - a);
}

export function informeDoAno(lancamentos: LancamentoDoInforme[], ano: number, nomeDaObra: (projectId: string) => string): InformeDoAno {
    const fimDoAno = `${ano}-12-31`;
    const fimDoAnterior = `${ano - 1}-12-31`;
    const porObra = new Map<string, LinhaDoInforme>();
    let semData = 0;
    const linha = (id: string) => {
        let l = porObra.get(id);
        if (!l) { l = { projectId: id, nome: nomeDaObra(id), custoAnterior: 0, custoAtual: 0, rendimentos: 0 }; porObra.set(id, l); }
        return l;
    };
    for (const c of lancamentos) {
        if (c.status !== 'liquidado') continue;
        if (!c.paid_date) { semData++; continue; }
        const dia = c.paid_date.slice(0, 10);
        const v = Number(c.amount) || 0;
        if (c.type === 'aporte' || c.type === 'retirada') {
            const sinal = c.type === 'aporte' ? 1 : -1;
            if (dia <= fimDoAnterior) linha(c.project_id).custoAnterior += sinal * v;
            if (dia <= fimDoAno) linha(c.project_id).custoAtual += sinal * v;
        } else if ((c.type === 'dividendo' || c.type === 'distribuicao') && dia.startsWith(`${ano}-`)) {
            linha(c.project_id).rendimentos += v;
        }
    }
    const linhas = [...porObra.values()].filter(l => l.custoAnterior || l.custoAtual || l.rendimentos);
    return {
        ano,
        linhas,
        custoAnterior: linhas.reduce((s, l) => s + l.custoAnterior, 0),
        custoAtual: linhas.reduce((s, l) => s + l.custoAtual, 0),
        rendimentos: linhas.reduce((s, l) => s + l.rendimentos, 0),
        semData,
    };
}
