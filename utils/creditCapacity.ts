/**
 * Capacidade de pagamento do Credit Room — a conta pura.
 *
 * Puro: nada aqui toca banco. Quem coleta os títulos da carteira, as locações
 * vigentes, o serviço da dívida atual e o da proposta é o service da F1; este
 * módulo projeta a renda mês a mês, mede a folga contra o serviço e responde
 * "quanto de dívida nova cabe".
 *
 * Regras que o desenho inteiro respeita:
 *
 *   · "Dado ausente ≠ zero." Razão sem denominador é `null`, nunca Infinity
 *     nem 0 — DSCR de um mês sem dívida aparece como "—", não como "sem risco".
 *
 *   · Mês é a string 'AAAA-MM' (`slice(0, 7)` da data ISO), nunca
 *     `new Date('AAAA-MM-DD')`: isso é lido como UTC e retrocede um dia em
 *     UTC-3 — o mesmo bug de fuso que já mordeu o cronograma deste projeto.
 *     A conta em dias usa `Date.UTC`, que não tem fuso.
 *
 *   · Nome de cliente nunca sai como dado: só rótulo mascarado
 *     (`rotuloMascarado`). `partyKey` serve apenas para AGRUPAR, na hora, e
 *     não é congelado em nenhum snapshot.
 *
 *   · R8: só entra na renda líquida o fluxo que a operação marcou como
 *     elegível (`eligible_flows.receivables` / `.noi`).
 *
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md — spec da
 * capacidade de pagamento (F1).
 */

import { round2 } from './financialMath';
import { buildSchedule } from './debtAmortization';
import { wale, type LeaseContract } from '../lib/rentalExecutive';
import { ratio, ratioPct } from './creditRoomSnapshot';

// ── Tipos de entrada ─────────────────────────────────────────────────────────

export type Natureza = 'VENDA' | 'LOCACAO';

export interface TituloCarteira {
    id: string;
    organizationId: string;
    contractId: string | null;
    natureza: Natureza | null;
    empreendimentoId: string | null;
    /** `party_id ?? party_name` — só para agrupar, nunca congelado. */
    partyKey: string | null;
    dueDate: string | null;
    paymentDate: string | null;
    amount: number;
    /** `effective_status === 'RECEBIDO'`. */
    recebido: boolean;
}

export interface LocacaoVigente {
    contractId: string;
    organizationId: string;
    empreendimentoId: string | null;
    partyKey: string | null;
    aluguelMensal: number;
    inicio: string | null;
    fim: string | null;
}

export interface ParametrosCapacidade {
    dscr_minimo: number;
    /** Taxa mensal em PERCENTUAL (1.2 = 1,2% a.m.). */
    taxa_mensal_pct: number;
    prazo_meses: number;
    carencia_meses: number;
    sistema: 'PRICE' | 'SAC';
    horizonte_meses: number;
    haircut_estoque_pct: number;
    despesa_operacional: boolean;
}

export const PARAMETROS_CAPACIDADE_PADRAO: ParametrosCapacidade = {
    dscr_minimo: 1.3,
    taxa_mensal_pct: 1.2,
    prazo_meses: 60,
    carencia_meses: 0,
    sistema: 'PRICE',
    horizonte_meses: 36,
    haircut_estoque_pct: 30,
    despesa_operacional: true,
};

export interface SerieMes {
    /** 'AAAA-MM'. */
    mes: string;
    vendas: number;
    alugueis: number;
    despesa_operacional: number;
    renda_liquida: number;
    servico_atual: number;
    servico_novo: number;
    folga: number;
    dscr: number | null;
}

export interface FluxosElegiveis {
    vendas: boolean;
    alugueis: boolean;
}

export interface CapacidadeEntrada {
    /** 'AAAA-MM-DD'. */
    dataBase: string;
    horizonte: number;
    titulos: TituloCarteira[];
    locacoes: LocacaoVigente[];
    /** Média 12m; 0 se a despesa operacional está desligada. */
    despesaMensal: number;
    /** Chave 'AAAA-MM'. */
    servicoAtualPorMes: Record<string, number>;
    servicoNovoPorMes: Record<string, number>;
    /** `eligible_flows.receivables` / `.noi`. */
    fluxos: FluxosElegiveis;
}

// ── Datas ────────────────────────────────────────────────────────────────────

const mesDe = (iso: string): string => iso.slice(0, 7);
const diaDe = (iso: string): string => iso.slice(0, 10);

/** Soma `delta` meses a um 'AAAA-MM' (aritmética inteira, sem `Date`). */
const somarMeses = (mes: string, delta: number): string => {
    const [y, m] = mes.split('-').map(Number);
    const idx = y * 12 + (m - 1) + delta;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};

/**
 * Os `n` meses que começam no mês SEGUINTE ao da data-base. O mês da data-base
 * fica de fora de propósito: ele já está parcialmente vivido (vencido e
 * "a vencer no mês" são reportados à parte).
 */
export function mesesDoHorizonte(dataBase: string, n: number): string[] {
    const atual = mesDe(dataBase);
    return Array.from({ length: Math.max(0, n) }, (_, i) => somarMeses(atual, i + 1));
}

/** Os 12 meses que terminam no mês da data-base, em ordem crescente. */
const ultimos12Meses = (dataBase: string): string[] => {
    const atual = mesDe(dataBase);
    return Array.from({ length: 12 }, (_, i) => somarMeses(atual, i - 11));
};

const n0 = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : v);

// ── Série de renda ───────────────────────────────────────────────────────────

/** Prazo indeterminado: sem fim, ou fim já vencido com a locação seguindo viva. */
const prazoIndeterminado = (l: LocacaoVigente, dataBase: string): boolean =>
    !l.fim || diaDe(l.fim) < diaDe(dataBase);

/**
 * A locação gera aluguel neste mês? Compara strings ISO (que ordenam como
 * datas): `AAAA-MM-31` é maior ou igual a qualquer dia do mês, `AAAA-MM-01` é
 * menor ou igual.
 */
const locacaoNoMes = (l: LocacaoVigente, mes: string, dataBase: string): boolean => {
    if (l.inicio && diaDe(l.inicio) > `${mes}-31`) return false;
    if (prazoIndeterminado(l, dataBase)) return true;
    return diaDe(l.fim as string) >= `${mes}-01`;
};

const montarMes = (
    mes: string, vendas: number, alugueis: number, despesa: number,
    servicoAtual: number, servicoNovo: number, fluxos: FluxosElegiveis,
): SerieMes => {
    const rendaLiquida = round2(
        (fluxos.vendas ? vendas : 0) + (fluxos.alugueis ? alugueis - despesa : 0),
    );
    const servico = servicoAtual + servicoNovo;
    return {
        mes,
        vendas,
        alugueis,
        despesa_operacional: despesa,
        renda_liquida: rendaLiquida,
        servico_atual: servicoAtual,
        servico_novo: servicoNovo,
        folga: round2(rendaLiquida - servico),
        dscr: ratio(rendaLiquida, servico),
    };
};

/**
 * Projeta a renda mês a mês.
 *
 * Venda vem dos TÍTULOS abertos; aluguel vem do CONTRATO. Título futuro de
 * locação não soma — o contrato já projeta o mesmo aluguel, e somar os dois
 * contaria cada mês duas vezes.
 *
 * Título aberto com vencimento até a data-base é `vencido_na_data_base`; com
 * vencimento depois dela mas no mesmo mês, `a_vencer_mes_corrente`. Nenhum dos
 * dois entra na série (que começa no mês seguinte).
 */
export function serieDeRenda(e: CapacidadeEntrada): {
    serie: SerieMes[]; vencido_na_data_base: number; a_vencer_mes_corrente: number;
} {
    const meses = mesesDoHorizonte(e.dataBase, e.horizonte);
    const mesAtual = mesDe(e.dataBase);
    const dia = diaDe(e.dataBase);

    let vencido = 0;
    let aVencerMes = 0;
    const vendasPorMes = new Map<string, number>();

    for (const t of e.titulos) {
        if (t.recebido || !t.dueDate) continue;
        const venc = diaDe(t.dueDate);
        if (venc <= dia) { vencido += n0(t.amount); continue; }
        const m = mesDe(venc);
        if (m === mesAtual) { aVencerMes += n0(t.amount); continue; }
        if (t.natureza === 'VENDA') vendasPorMes.set(m, (vendasPorMes.get(m) ?? 0) + n0(t.amount));
    }

    const alugueisDoMes = (mes: string) => round2(
        e.locacoes
            .filter(l => locacaoNoMes(l, mes, e.dataBase))
            .reduce((a, l) => a + n0(l.aluguelMensal), 0),
    );

    const aluguelBase = meses.length ? alugueisDoMes(meses[0]) : 0;

    const serie = meses.map(mes => {
        const alugueis = alugueisDoMes(mes);
        // A despesa acompanha a queda do aluguel: é proporcional ao 1º mês.
        const despesa = aluguelBase > 0 ? round2(n0(e.despesaMensal) * alugueis / aluguelBase) : 0;
        return montarMes(
            mes,
            round2(vendasPorMes.get(mes) ?? 0),
            alugueis,
            despesa,
            n0(e.servicoAtualPorMes[mes]),
            n0(e.servicoNovoPorMes[mes]),
            e.fluxos,
        );
    });

    return {
        serie,
        vencido_na_data_base: round2(vencido),
        a_vencer_mes_corrente: round2(aVencerMes),
    };
}

/**
 * Histórico do que foi efetivamente recebido, pelo mês do PAGAMENTO, nos 12
 * meses que terminam na data-base. Título sem natureza não é classificável e
 * fica de fora (dado ausente ≠ vendas).
 */
export function recebidoPorMes(
    titulos: TituloCarteira[], dataBase: string,
): { mes: string; vendas: number; alugueis: number }[] {
    const linhas = ultimos12Meses(dataBase).map(mes => ({ mes, vendas: 0, alugueis: 0 }));
    const porMes = new Map(linhas.map(l => [l.mes, l]));
    for (const t of titulos) {
        if (!t.recebido || !t.paymentDate) continue;
        const linha = porMes.get(mesDe(t.paymentDate));
        if (!linha) continue;
        if (t.natureza === 'VENDA') linha.vendas += n0(t.amount);
        else if (t.natureza === 'LOCACAO') linha.alugueis += n0(t.amount);
    }
    return linhas.map(l => ({ mes: l.mes, vendas: round2(l.vendas), alugueis: round2(l.alugueis) }));
}

// ── Capacidade máxima ────────────────────────────────────────────────────────

/** Passo da busca do valor máximo: R$ 100 de precisão. */
const PASSO_VALOR = 100;

/**
 * Quanto de dívida nova cabe — conferido mês a mês, no horizonte INTEIRO.
 *
 * Decisão do usuário (21/11/2026): a janela é todo o horizonte da série, não
 * os 12 primeiros meses. Com carência ≥ 12, os 12 primeiros meses só têm
 * juros; medir só eles inflava o valor máximo (com taxa 0, devolvia o teto).
 *
 * Para cada mês `i` da série em que cai uma parcela da dívida nova (o
 * cronograma começa em `primeiroVencimento`, que é o 1º mês da série):
 *
 *     limite_i = renda_liquida_i ÷ DSCR mínimo − serviço atual_i
 *
 * `parcela_maxima` = o menor `limite_i` (nunca negativo). `valor_maximo` = o
 * maior principal (de R$ 100 em R$ 100) cujo cronograma cabe em TODOS os
 * meses: `parcela_i ≤ limite_i`. Venda que acaba no mês 18 aperta o limite
 * dali em diante, e é isso que segura o valor.
 *
 * Parcela que cai DEPOIS do horizonte não é conferida (não há renda projetada
 * para comparar) — com uma exceção conservadora: se nenhuma parcela que
 * amortiza cai dentro do horizonte (carência ≥ horizonte), a 1ª que amortiza
 * é conferida contra `parcela_maxima`, o pior mês visto. Sem isso a carência
 * esconderia a amortização inteira e o valor sairia ilimitado.
 */
export function capacidadeMaxima(
    serie: SerieMes[], p: ParametrosCapacidade, primeiroVencimento: string,
): { parcela_maxima: number; valor_maximo: number } {
    const zero = { parcela_maxima: 0, valor_maximo: 0 };
    if (!serie.length || !(p.dscr_minimo > 0) || !(p.prazo_meses > 0)) return zero;

    const cronograma = (principal: number) => buildSchedule({
        principal,
        nominalRate: p.taxa_mensal_pct,
        ratePeriod: 'MENSAL',
        system: p.sistema,
        installmentCount: p.prazo_meses,
        installmentPeriod: 'MENSAL',
        firstDueDate: primeiroVencimento,
        gracePrincipalPeriods: p.carencia_meses,
    });

    // Meses da série cobertos pelo cronograma: a posição de cada parcela vem
    // da data dela, não de supor que a parcela k cai no mês k da série.
    const limitePorMes = new Map(serie.map(m => [m.mes, m.renda_liquida / p.dscr_minimo - m.servico_atual]));
    const mesesDasParcelas = cronograma(PASSO_VALOR).map(l => mesDe(l.dueDate));
    const sobrepostas = mesesDasParcelas
        .map((mes, k) => ({ k, limite: limitePorMes.get(mes) }))
        .filter((x): x is { k: number; limite: number } => x.limite !== undefined);
    if (!sobrepostas.length) return zero;

    const menorLimite = Math.min(...sobrepostas.map(x => x.limite));
    if (!(menorLimite > 0)) return zero;
    const parcelaMaxima = round2(menorLimite);

    // A 1ª parcela que amortiza (k = carência) fora do horizonte entra contra o pior mês.
    const carencia = Math.min(Math.max(0, p.carencia_meses), p.prazo_meses - 1);
    const conferidas = sobrepostas.some(x => x.k >= carencia)
        ? sobrepostas
        : [...sobrepostas, { k: carencia, limite: menorLimite }];

    const cabe = (principal: number): boolean => {
        const linhas = cronograma(principal);
        return conferidas.every(x => (linhas[x.k]?.total ?? 0) <= x.limite);
    };

    // Busca binária sobre o número de passos de R$ 100. Teto seguro: toda
    // parcela que amortiza paga ao menos principal ÷ prazo, e ela cabe no
    // maior limite — então o principal nunca passa de maiorLimite × prazo.
    const maiorLimite = Math.max(...conferidas.map(x => x.limite));
    let baixo = 0;
    let alto = Math.floor((maiorLimite * p.prazo_meses) / PASSO_VALOR);
    while (baixo < alto) {
        const meio = Math.ceil((baixo + alto) / 2);
        if (cabe(meio * PASSO_VALOR)) baixo = meio;
        else alto = meio - 1;
    }

    return { parcela_maxima: parcelaMaxima, valor_maximo: baixo * PASSO_VALOR };
}

// ── Estresse ─────────────────────────────────────────────────────────────────

export interface CenarioEstresse {
    nome: string;
    inadimplencia_pct: number;
    vacancia_pct: number;
    distrato_pct: number;
}

export const CENARIOS_ESTRESSE: CenarioEstresse[] = [
    { nome: 'Base', inadimplencia_pct: 0, vacancia_pct: 0, distrato_pct: 0 },
    { nome: 'Moderado', inadimplencia_pct: 10, vacancia_pct: 10, distrato_pct: 5 },
    { nome: 'Severo', inadimplencia_pct: 25, vacancia_pct: 20, distrato_pct: 15 },
];

/**
 * Aplica o cenário à série: vendas × (1 − distrato)(1 − inadimplência), aluguéis
 * × (1 − vacância)(1 − inadimplência). Despesa e serviço da dívida NÃO mudam —
 * o prédio continua custando e o banco continua cobrando.
 *
 * `fluxos` diz quais fluxos a operação marcou como elegíveis (a série guarda o
 * bruto das duas pernas, então não dá para deduzi-lo dela); sem ele, os dois.
 */
export function aplicarEstresse(
    serie: SerieMes[], c: CenarioEstresse,
    fluxos: FluxosElegiveis = { vendas: true, alugueis: true },
): { serie: SerieMes[]; dscr_minimo_12m: number | null; meses_folga_negativa: number } {
    const fVendas = (1 - c.distrato_pct / 100) * (1 - c.inadimplencia_pct / 100);
    const fAlugueis = (1 - c.vacancia_pct / 100) * (1 - c.inadimplencia_pct / 100);

    const estressada = serie.map(m => montarMes(
        m.mes,
        round2(m.vendas * fVendas),
        round2(m.alugueis * fAlugueis),
        m.despesa_operacional,
        m.servico_atual,
        m.servico_novo,
        fluxos,
    ));

    const dscrs = estressada.slice(0, 12)
        .map(m => m.dscr)
        .filter((d): d is number => d !== null);

    return {
        serie: estressada,
        dscr_minimo_12m: dscrs.length ? Math.min(...dscrs) : null,
        meses_folga_negativa: estressada.filter(m => m.folga < 0).length,
    };
}

// ── Alertas da carteira ──────────────────────────────────────────────────────

export type TipoAlerta =
    | 'VENDA_SEM_PARCELAS' | 'LOCACAO_SEM_VALOR'
    | 'LOCACAO_PRAZO_INDETERMINADO' | 'TITULO_SEM_EMPREENDIMENTO';

export interface AlertaCarteira {
    tipo: TipoAlerta;
    qtd: number;
    valor: number;
}

/**
 * Furos de cadastro que distorcem a projeção. Devolve só os alertas que
 * existem (`qtd > 0`): carteira limpa = lista vazia.
 */
export function alertasDaCarteira(i: {
    dataBase: string;
    titulos: TituloCarteira[];
    locacoes: LocacaoVigente[];
    vendasSemTitulo: { dealId: string; valor: number }[];
}): AlertaCarteira[] {
    const soma = (xs: number[]) => round2(xs.reduce((a, v) => a + n0(v), 0));

    const semEmp = i.titulos.filter(t => !t.recebido && !t.empreendimentoId);
    const semValor = i.locacoes.filter(l => !(n0(l.aluguelMensal) > 0));
    const indeterminadas = i.locacoes.filter(l => prazoIndeterminado(l, i.dataBase));

    const todos: AlertaCarteira[] = [
        { tipo: 'VENDA_SEM_PARCELAS', qtd: i.vendasSemTitulo.length, valor: soma(i.vendasSemTitulo.map(v => v.valor)) },
        { tipo: 'LOCACAO_SEM_VALOR', qtd: semValor.length, valor: 0 },
        { tipo: 'LOCACAO_PRAZO_INDETERMINADO', qtd: indeterminadas.length, valor: soma(indeterminadas.map(l => l.aluguelMensal)) },
        { tipo: 'TITULO_SEM_EMPREENDIMENTO', qtd: semEmp.length, valor: soma(semEmp.map(t => t.amount)) },
    ];
    return todos.filter(a => a.qtd > 0);
}

// ── Qualidade da renda ───────────────────────────────────────────────────────

export interface QualidadeRenda {
    concentracao_top5_pct: number | null;
    wale_anos: number | null;
    locacoes_prazo_indeterminado: number;
    pontualidade_12m_pct: number | null;
}

/**
 * Concentração, prazo e pontualidade da renda.
 *
 * Concentração: renda futura da série (títulos de venda abertos com vencimento
 * no horizonte + aluguel × meses em que o contrato vigora) dos 5 maiores
 * pagadores sobre o total. Pagador sem `partyKey` entra no total mas não
 * forma grupo — não há como saber se são a mesma pessoa.
 *
 * Pontualidade: dos títulos com vencimento nos 12 meses até a data-base —
 * TODOS, pagos e em aberto —, quantos foram pagos até o vencimento. Dividir
 * só pelos pagos (regra antiga) escondia o calote: quem nunca pagou sumia do
 * denominador e a pontualidade subia. Pago sem data de pagamento conhecida
 * conta no denominador e não no numerador (não dá para afirmar "em dia").
 * Sem título vencido na janela, `null`.
 */
export function qualidadeDaRenda(e: CapacidadeEntrada): QualidadeRenda {
    const meses = mesesDoHorizonte(e.dataBase, e.horizonte);
    const mesesSet = new Set(meses);
    const dia = diaDe(e.dataBase);

    const porPagador = new Map<string, number>();
    let total = 0;
    const somar = (chave: string | null, valor: number) => {
        total += valor;
        if (chave) porPagador.set(chave, (porPagador.get(chave) ?? 0) + valor);
    };

    for (const t of e.titulos) {
        if (t.recebido || t.natureza !== 'VENDA' || !t.dueDate) continue;
        if (diaDe(t.dueDate) <= dia || !mesesSet.has(mesDe(t.dueDate))) continue;
        somar(t.partyKey, n0(t.amount));
    }
    for (const l of e.locacoes) {
        const vigentes = meses.filter(m => locacaoNoMes(l, m, e.dataBase)).length;
        somar(l.partyKey, n0(l.aluguelMensal) * vigentes);
    }

    const top5 = [...porPagador.values()].sort((a, b) => b - a).slice(0, 5)
        .reduce((a, v) => a + v, 0);

    // WALE: `now` da data-base, sem fuso. Contrato sem fim ou vencido o `wale()`
    // já deixa de fora da média; aqui só os contamos como prazo indeterminado.
    const [y, m, d] = diaDe(e.dataBase).split('-').map(Number);
    const contratos: LeaseContract[] = e.locacoes.map(l => ({
        id: l.contractId, end_date: l.fim, value: l.aluguelMensal, active: true,
    }));
    const w = wale(contratos, new Date(Date.UTC(y, m - 1, d)));

    const inicioJanela = `${somarMeses(mesDe(e.dataBase), -11)}-01`;
    const vencidosNaJanela = e.titulos.filter(t =>
        !!t.dueDate && diaDe(t.dueDate) >= inicioJanela && diaDe(t.dueDate) <= dia);
    const emDia = vencidosNaJanela.filter(t =>
        t.recebido && !!t.paymentDate && diaDe(t.paymentDate) <= diaDe(t.dueDate as string));

    return {
        concentracao_top5_pct: ratioPct(top5, total),
        wale_anos: w.years == null ? null : round2(w.years),
        locacoes_prazo_indeterminado: e.locacoes.filter(l => prazoIndeterminado(l, e.dataBase)).length,
        pontualidade_12m_pct: vencidosNaJanela.length ? round2((emDia.length / vencidosNaJanela.length) * 100) : null,
    };
}

// ── Rótulo mascarado ─────────────────────────────────────────────────────────

/** 'Comprador 01' / 'Locatário 03' — o nome do cliente nunca sai como dado. */
export function rotuloMascarado(natureza: Natureza, ordem: number): string {
    const papel = natureza === 'LOCACAO' ? 'Locatário' : 'Comprador';
    return `${papel} ${String(ordem).padStart(2, '0')}`;
}
