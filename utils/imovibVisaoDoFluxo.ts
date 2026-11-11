import { calcularTirMensal } from './imovibMotor';
import type { ImovibMathResult, LinhasDoMes } from './imovibMotor';

/**
 * Visões do fluxo de caixa da aba Dinâmica (item 2.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): do acionista ou
 * do projeto, nominal ou real, por mês, trimestre ou ano. Pura: a tela só exibe.
 * Testes: __tests__/imovibVisaoDoFluxo.test.ts.
 */

export type VisaoDoFluxo = 'acionista' | 'projeto';
export type BaseDoFluxo = 'nominal' | 'real';
export type PeriodoDoFluxo = 'mensal' | 'trimestral' | 'anual';

export interface OpcoesDaVisao {
    visao: VisaoDoFluxo;
    base: BaseDoFluxo;
    periodo: PeriodoDoFluxo;
    /** Inflação geral do estudo (% a.m.), que deflaciona a visão real. */
    inflacaoMensalPct: number;
}

export interface PeriodoDaVisao {
    rotulo: string;
    linhas: LinhasDoMes;
    rev: number;
    cost: number;
    net: number;
    acc: number;
}

export interface VisaoMontada {
    periodos: PeriodoDaVisao[];
    /** Linhas com algum valor diferente de zero na visão — as que a tabela mostra. */
    linhasComValor: (keyof LinhasDoMes)[];
    /** TIR do fluxo mensal da visão (deflacionado na real), % a.a.; NaN sem TIR. */
    tirAnual: number;
    /** Menor acumulado mensal da visão. */
    exposicaoMaxima: number;
}

export type GrupoDoFluxo = 'receitas' | 'custos' | 'financiamento';

/** Linhas do fluxo agrupadas, com o rótulo usado na tela e no Excel. A ordem é a da tabela. */
export const GRUPOS_DO_FLUXO: { id: GrupoDoFluxo; rotulo: string; linhas: { chave: keyof LinhasDoMes; rotulo: string }[] }[] = [
    {
        id: 'receitas', rotulo: 'Receitas', linhas: [
            { chave: 'receitaSinal', rotulo: 'Sinal' },
            { chave: 'receitaParcelasObra', rotulo: 'Parcelas de obra' },
            { chave: 'receitaIntermediarias', rotulo: 'Intermediárias' },
            { chave: 'receitaRepasse', rotulo: 'Repasse / chaves' },
            { chave: 'receitaPosChaves', rotulo: 'Pós-chaves' },
            { chave: 'devolucaoDistrato', rotulo: 'Devolução de distrato' },
            { chave: 'impostos', rotulo: 'Impostos' },
            { chave: 'comercial', rotulo: 'Comercial (corretagem)' },
            { chave: 'outrasDeducoes', rotulo: 'Outras deduções' },
        ],
    },
    {
        id: 'custos', rotulo: 'Custos', linhas: [
            { chave: 'terreno', rotulo: 'Terreno' },
            { chave: 'rubricasTerreno', rotulo: 'Rubricas do terreno' },
            { chave: 'obra', rotulo: 'Obra' },
            { chave: 'rubricasObra', rotulo: 'Rubricas da obra' },
            { chave: 'rubricasVendas', rotulo: 'Rubricas de vendas' },
            { chave: 'carregamentoDoEstoque', rotulo: 'Estoque (condomínio, IPTU)' },
        ],
    },
    {
        id: 'financiamento', rotulo: 'Financiamento', linhas: [
            { chave: 'liberacaoDivida', rotulo: 'Liberação da dívida' },
            { chave: 'pagamentoDaDivida', rotulo: 'Pagamento da dívida' },
            { chave: 'aporteDeTerceiros', rotulo: 'Aporte de terceiros' },
            { chave: 'remuneracaoDeTerceiros', rotulo: 'Remuneração de terceiros' },
        ],
    },
];

/** Linhas que só existem no fluxo do acionista (dívida e terceiros). */
export const LINHAS_DA_DIVIDA: (keyof LinhasDoMes)[] = ['liberacaoDivida', 'pagamentoDaDivida', 'aporteDeTerceiros', 'remuneracaoDeTerceiros'];

const ROTULO_DO_PERIODO: Record<PeriodoDoFluxo, (k: number) => string> = {
    mensal: k => `Mês ${k}`,
    trimestral: k => `Trimestre ${k}`,
    anual: k => `Ano ${k}`,
};
const MESES_DO_PERIODO: Record<PeriodoDoFluxo, number> = { mensal: 1, trimestral: 3, anual: 12 };

export function montarVisaoDoFluxo(r: ImovibMathResult, o: OpcoesDaVisao): VisaoMontada {
    const inflacao = o.inflacaoMensalPct / 100;
    const mensal = r.monthlyFlows.map((f, i) => {
        const fator = o.base === 'real' ? Math.pow(1 + inflacao, i) : 1;
        const linhas = { ...f.linhas };
        if (o.visao === 'projeto') for (const l of LINHAS_DA_DIVIDA) linhas[l] = 0;
        for (const k of Object.keys(linhas) as (keyof LinhasDoMes)[]) linhas[k] = linhas[k] / fator;
        const net = (o.visao === 'projeto' ? f.netProjeto : f.net) / fator;
        return { linhas, rev: f.rev / fator, cost: f.cost / fator, net };
    });

    const tamanho = MESES_DO_PERIODO[o.periodo];
    const periodos: PeriodoDaVisao[] = [];
    let acc = 0;
    mensal.forEach((m, i) => {
        const k = Math.floor(i / tamanho);
        if (!periodos[k]) {
            periodos[k] = { rotulo: ROTULO_DO_PERIODO[o.periodo](k + 1), linhas: Object.fromEntries(Object.keys(m.linhas).map(l => [l, 0])) as unknown as LinhasDoMes, rev: 0, cost: 0, net: 0, acc: 0 };
        }
        const p = periodos[k];
        for (const l of Object.keys(m.linhas) as (keyof LinhasDoMes)[]) p.linhas[l] += m.linhas[l];
        p.rev += m.rev;
        p.cost += m.cost;
        p.net += m.net;
        acc += m.net;
        p.acc = acc;
    });

    const linhasComValor = (mensal[0] ? (Object.keys(mensal[0].linhas) as (keyof LinhasDoMes)[]) : [])
        .filter(l => mensal.some(m => Math.abs(m.linhas[l]) > 0.005));

    const tir = calcularTirMensal(mensal.map(m => m.net)).taxa;
    let acumulado = 0;
    let exposicaoMaxima = 0;
    for (const m of mensal) { acumulado += m.net; if (acumulado < exposicaoMaxima) exposicaoMaxima = acumulado; }

    return {
        periodos,
        linhasComValor,
        tirAnual: Number.isFinite(tir) ? (Math.pow(1 + tir, 12) - 1) * 100 : NaN,
        exposicaoMaxima,
    };
}
