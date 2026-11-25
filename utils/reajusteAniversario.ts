import { somarMeses } from './paymentPlan';

/**
 * Reajuste de locação pelo ANIVERSÁRIO — plano
 * docs/planos/2026-11-24-locacoes-reajustes-separados-das-renovacoes.md (Fase 2).
 *
 * Pedido do usuário (24/11/2026): o reajuste é aplicado de acordo com a
 * periodicidade (anual = a cada 12 meses), só dentro da vigência, e na data
 * o usuário escolhe aplicar 100% do índice, outro valor, ou nada. Até aqui o app
 * comparava o índice de HOJE com o da data-base (CTL-006-012-0001: 10 anos de
 * IGP-M de uma vez num contrato de 30 meses) e contava o próximo reajuste a
 * partir do dia do clique.
 */

/** Periodicidade do reajuste em meses. Vazio = Anual (decisão do usuário). */
export function mesesDaPeriodicidade(meses?: number | null): number {
    return meses && meses > 0 ? Math.floor(meses) : 12;
}

/** "Periodicidade do Reajuste" da negociação → meses. Vazio/desconhecido = null (= Anual). */
export function mesesDoCicloDeReajuste(ciclo?: string | null): number | null {
    switch (ciclo) {
        case 'Mensal': return 1;
        case 'Bimestral': return 2;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return null;
    }
}

export interface ContratoComReajuste {
    start_date?: string | null;
    end_date?: string | null;
    reajuste_data_base?: string | null;
    reajuste_proximo?: string | null;
    reajuste_periodicidade_meses?: number | null;
}

export interface AniversarioReajuste {
    /** Data-base do período que este aniversário fecha (o índice "de"). */
    dataBase: string;
    /** O aniversário a tratar (o índice "até", e a data a partir da qual vale). */
    aniversario: string;
    /** Aniversário seguinte = este + periodicidade (nunca "hoje + 12"). */
    proximo: string;
    /** Aniversário depois do fim da vigência não é reajuste — é renovação. */
    dentroDaVigencia: boolean;
}

/**
 * `dataEscolhida`: a data de reajuste que o usuário digitou na gaveta (pedido de
 * 24/11/2026 — vem pré-preenchida com a calculada). Ela vira o aniversário: o
 * índice "até", as parcelas a partir dela e o próximo = ela + periodicidade.
 */
export function aniversarioDoReajuste(c: ContratoComReajuste, dataEscolhida?: string | null): AniversarioReajuste | null {
    const periodo = mesesDaPeriodicidade(c.reajuste_periodicidade_meses);
    const dataBase = (c.reajuste_data_base || c.start_date || '').slice(0, 10);
    if (!dataBase) return null;
    const aniversario = (dataEscolhida || c.reajuste_proximo || somarMeses(dataBase, periodo)).slice(0, 10);
    const fim = (c.end_date || '').slice(0, 10);
    return {
        dataBase,
        aniversario,
        proximo: somarMeses(aniversario, periodo),
        dentroDaVigencia: !fim || aniversario <= fim,
    };
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/');

/** Por que a data de reajuste escolhida não serve; null = serve. */
export function motivoDaDataDeReajuste(c: ContratoComReajuste, data: string): string | null {
    if (!data) return 'Informe a data do reajuste.';
    const a = aniversarioDoReajuste(c, data);
    if (!a) return 'Contrato sem data-base de reajuste nem início de vigência.';
    if (a.aniversario <= a.dataBase) return `A data do reajuste deve ser depois da data-base (${dataBR(a.dataBase)}).`;
    if (!a.dentroDaVigencia) return `A data do reajuste (${dataBR(a.aniversario)}) é depois do fim da vigência — o caso é de renovação, não de reajuste.`;
    return null;
}

export type DecisaoReajuste =
    | { tipo: 'INDICE' }
    | { tipo: 'PERCENTUAL'; percentual: number }
    | { tipo: 'VALOR'; valor: number }
    | { tipo: 'NAO_APLICADO' };

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor novo do aluguel pela decisão do usuário. `fatorIndice` = índice do
 * aniversário ÷ índice da data-base (null quando o índice não está cadastrado).
 */
export function valorAposReajuste(
    valorAtual: number,
    fatorIndice: number | null,
    decisao: DecisaoReajuste,
): { valorNovo: number; percentualAplicado: number } {
    const atual = Number(valorAtual) || 0;
    switch (decisao.tipo) {
        case 'INDICE': {
            if (!fatorIndice || fatorIndice <= 0) {
                throw new Error('Índice não cadastrado para as datas do reajuste — informe o percentual ou o valor novo.');
            }
            return { valorNovo: centavos(atual * fatorIndice), percentualAplicado: centavos((fatorIndice - 1) * 100) };
        }
        case 'PERCENTUAL': {
            const p = Number(decisao.percentual);
            if (!Number.isFinite(p) || p <= -100) throw new Error('Percentual de reajuste inválido.');
            return { valorNovo: centavos(atual * (1 + p / 100)), percentualAplicado: centavos(p) };
        }
        case 'VALOR': {
            const v = Number(decisao.valor);
            if (!Number.isFinite(v) || v <= 0) throw new Error('Informe um valor de aluguel maior que zero.');
            return { valorNovo: centavos(v), percentualAplicado: atual > 0 ? centavos((v / atual - 1) * 100) : 0 };
        }
        case 'NAO_APLICADO':
            return { valorNovo: centavos(atual), percentualAplicado: 0 };
    }
}

/**
 * Entra na fila de Locações › Reajustes (e no aviso): aniversário dentro da
 * vigência e a até `diasAviso` dias de hoje (vencido também entra — fica até
 * alguém decidir).
 */
export function entraNaFilaDeReajuste(c: ContratoComReajuste, diasAviso: number, hojeISO: string): boolean {
    const a = aniversarioDoReajuste(c);
    if (!a || !a.dentroDaVigencia) return false;
    const [y, m, d] = hojeISO.slice(0, 10).split('-').map(Number);
    const limite = new Date(Date.UTC(y, m - 1, d + Math.max(0, diasAviso))).toISOString().slice(0, 10);
    return a.aniversario <= limite;
}

/**
 * O que levar dos termos de reajuste da negociação ("Periodicidade do Reajuste"
 * e "Índice de Reajuste", aba Contrato › Dados do contrato) ao contrato já
 * gerado. `null` = nada a gravar. Trocar a periodicidade recalcula o próximo
 * aniversário a partir da data-base (data-base + periodicidade nova).
 */
export function termosDeReajusteParaOContrato(
    negociacao: { billing_cycle?: string | null; reajuste_index?: string | null },
    contrato: ContratoComReajuste & { reajuste_index?: string | null },
): { reajuste_periodicidade_meses?: number | null; reajuste_proximo?: string; reajuste_index?: string } | null {
    const patch: { reajuste_periodicidade_meses?: number | null; reajuste_proximo?: string; reajuste_index?: string } = {};
    const periodicidade = mesesDoCicloDeReajuste(negociacao.billing_cycle);
    if (periodicidade !== (contrato.reajuste_periodicidade_meses ?? null)) {
        patch.reajuste_periodicidade_meses = periodicidade;
        const base = (contrato.reajuste_data_base || contrato.start_date || '').slice(0, 10);
        if (base) patch.reajuste_proximo = somarMeses(base, mesesDaPeriodicidade(periodicidade));
    }
    if (negociacao.reajuste_index && negociacao.reajuste_index !== contrato.reajuste_index) {
        patch.reajuste_index = negociacao.reajuste_index;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Negociação de um contrato de locação: o próprio `deal_id` ou, no renovado (que
 * não herda deal_id — ver contractRenewalService.renewContract), o da raiz da
 * cadeia por `parent_contract_id`. null = nenhum elo tem negociação (ou laço).
 */
export function negociacaoDaCadeia(
    contratoId: string,
    contratos: Map<string, { deal_id: string | null; parent_contract_id: string | null }>,
): string | null {
    const vistos = new Set<string>();
    let atual: string | null = contratoId;
    while (atual && !vistos.has(atual)) {
        vistos.add(atual);
        const c = contratos.get(atual);
        if (!c) return null;
        if (c.deal_id) return c.deal_id;
        atual = c.parent_contract_id;
    }
    return null;
}

/**
 * Fila de Locações › Reajustes recortada pelo empreendimento aberto (pedido de
 * 24/11/2026). `negociacoes` null = fora de um empreendimento: a fila inteira.
 */
export function filaDoEmpreendimento<T extends { negociacaoId: string | null }>(
    fila: T[],
    negociacoes: Set<string> | null,
): T[] {
    if (!negociacoes) return fila;
    return fila.filter(l => !!l.negociacaoId && negociacoes.has(l.negociacaoId));
}
