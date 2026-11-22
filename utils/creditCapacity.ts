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
import { formatMoney } from '../components/ui/Format';
import { buildSchedule } from './debtAmortization';
import { wale, type LeaseContract } from '../lib/rentalExecutive';
import { ratio, ratioPct, type CreditRoomSnapshot, type SnapshotCapacidade } from './creditRoomSnapshot';

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

/**
 * Parâmetros que a conta usa de fato: o prazo e a carência da OPERAÇÃO
 * (Solicitação do room), quando preenchidos, vencem os dos parâmetros da
 * capacidade. O formulário mostra estes mesmos valores nos campos travados,
 * e valida com eles — para a tela e o congelamento dizerem o mesmo número.
 */
export function parametrosEfetivos(
    p: ParametrosCapacidade, termMonths?: number | null, graceMonths?: number | null,
): ParametrosCapacidade {
    return {
        ...p,
        prazo_meses: termMonths != null && termMonths > 0 ? termMonths : p.prazo_meses,
        carencia_meses: graceMonths ?? p.carencia_meses,
    };
}

/**
 * Regras que os parâmetros da capacidade precisam cumprir para a conta valer —
 * as mesmas no formulário do room ("Salvar") e na simulação da aba Capacidade
 * ("Salvar no room"). Devolve a mensagem do 1º problema, ou `null` se estiver ok.
 * Prazo/carência são validados pelos valores EFETIVOS (os da operação vencem).
 * `NaN` (campo vazio) nunca passa.
 */
export function validarParametrosCapacidade(
    pc: ParametrosCapacidade, termMonths?: number | null, graceMonths?: number | null,
): string | null {
    if (!(pc.dscr_minimo > 0)) return 'O DSCR mínimo da capacidade precisa ser maior que zero.';
    // Taxa vazia vira 0 no campo; 0% simularia a dívida nova SEM juros — serviço
    // novo menor e DSCR pós/valor máximo otimistas na frente do banco.
    if (!(pc.taxa_mensal_pct > 0)) return 'Informe a taxa mensal da capacidade (maior que zero) — sem ela a dívida nova seria simulada sem juros.';
    const ef = parametrosEfetivos(pc, termMonths, graceMonths);
    const dePrazo = prazoVemDaOperacao(termMonths) ? ' da operação' : ' da capacidade';
    const deCarencia = carenciaVemDaOperacao(graceMonths) ? ' da operação' : ' da capacidade';
    if (!Number.isInteger(ef.prazo_meses) || ef.prazo_meses < 1) return `O prazo${dePrazo} precisa ser um número inteiro de meses (mínimo 1).`;
    if (!Number.isInteger(ef.carencia_meses)) return `A carência${deCarencia} precisa ser um número inteiro de meses.`;
    if (ef.carencia_meses < 0 || ef.carencia_meses >= ef.prazo_meses) {
        return `A carência${deCarencia} (${ef.carencia_meses} meses) precisa ser de 0 até menos que o prazo${dePrazo} (${ef.prazo_meses} meses).`;
    }
    if (!(pc.haircut_estoque_pct >= 0 && pc.haircut_estoque_pct <= 100)) return 'O haircut do estoque fica entre 0 e 100%.';
    return null;
}

/** O prazo da capacidade vem da operação? (mesma regra de `parametrosEfetivos`) */
export const prazoVemDaOperacao = (termMonths?: number | null): boolean => termMonths != null && termMonths > 0;
/** A carência da capacidade vem da operação? (mesma regra de `parametrosEfetivos`) */
export const carenciaVemDaOperacao = (graceMonths?: number | null): boolean => graceMonths != null;

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

export const montarMes = (
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

// ── Bloco `capacidade` do snapshot ───────────────────────────────────────────

/** O que o service coletou para a capacidade — tudo já recortado pelo escopo. */
export interface MontarCapacidadeEntrada {
    fonte: string;
    /** 'AAAA-MM-DD'. */
    dataBase: string;
    horizonte: number;
    /** Os EFETIVOS: prazo/carência da operação já por cima (`parametrosEfetivos`). */
    parametros: ParametrosCapacidade;
    fluxos: FluxosElegiveis;
    /** 1º vencimento da dívida nova simulada (1º mês da série). */
    primeiroVencimento: string;
    /** Orgs do escopo, na mesma ordem dos arrays `…PorOrg`. */
    orgs: string[];
    /** TODOS os títulos (inclusive sem empreendimento): só alimentam TITULO_SEM_EMPREENDIMENTO. */
    titulos: TituloCarteira[];
    titulosDoEscopo: TituloCarteira[];
    locacoesDoEscopo: LocacaoVigente[];
    /** Consolidada do escopo; 0 se desligada ou sem aluguel para descontar. */
    despesaMensal: number;
    despesaPorOrg: (number | null)[];
    servicoAtualPorMes: Record<string, number>;
    servicoAtualPorOrg: (Record<string, number> | null)[];
    servicoNovoPorMes: Record<string, number>;
    vendasSemTitulo: { dealId: string; valor: number }[];
    /** `null` = empreendimentos não responderam (estoque fica `null`). */
    empreendimentos: { vgv_disponivel: number; objetivo: string | null }[] | null;
    dividaTotalPorOrg: (number | null | undefined)[];
}

/**
 * Monta o bloco `capacidade` do snapshot a partir do que o service coletou.
 *
 * Estoque: só empreendimento A VENDER entra — o de objetivo `LOCACAO` fica de
 * fora (o VGV dele não é estoque que vira caixa; a renda dele já é o aluguel).
 * Unidade alugada já sai do `vgv_disponivel` na coleta.
 */
export function montarCapacidade(e: MontarCapacidadeEntrada): SnapshotCapacidade {
    const entradaDe = (
        ts: TituloCarteira[], ls: LocacaoVigente[], despesa: number,
        servico: Record<string, number>, novo: Record<string, number>,
    ): CapacidadeEntrada => ({
        dataBase: e.dataBase, horizonte: e.horizonte, titulos: ts, locacoes: ls, despesaMensal: despesa,
        servicoAtualPorMes: servico, servicoNovoPorMes: novo, fluxos: e.fluxos,
    });
    const { serie, vencido_na_data_base, a_vencer_mes_corrente } = serieDeRenda(entradaDe(
        e.titulosDoEscopo, e.locacoesDoEscopo, e.despesaMensal, e.servicoAtualPorMes, e.servicoNovoPorMes,
    ));
    const vgvDisponivel = e.empreendimentos
        ? round2(e.empreendimentos
            .filter(x => x.objetivo !== 'LOCACAO')
            .reduce((a, x) => a + n0(x.vgv_disponivel), 0))
        : 0;
    const haircut = Math.min(100, Math.max(0, n0(e.parametros.haircut_estoque_pct)));
    const doze = <T,>(xs: T[]) => xs.slice(0, 12);
    return {
        fonte: e.fonte,
        data_base: e.dataBase,
        parametros: { ...e.parametros, horizonte_meses: e.horizonte },
        base: 'CONTRATADA',
        serie,
        recebido_12m: recebidoPorMes(e.titulosDoEscopo, e.dataBase),
        vencido_na_data_base,
        a_vencer_mes_corrente,
        estoque: vgvDisponivel > 0
            ? { vgv_disponivel: vgvDisponivel, haircut_pct: haircut, valor_elegivel: round2(vgvDisponivel * (1 - haircut / 100)) }
            : null,
        capacidade_maxima: capacidadeMaxima(serie, e.parametros, e.primeiroVencimento),
        // `titulos` inteiro (com os sem empreendimento) só aqui; as locações já recortadas.
        alertas: alertasDaCarteira({
            dataBase: e.dataBase, titulos: e.titulos, locacoes: e.locacoesDoEscopo, vendasSemTitulo: e.vendasSemTitulo,
        }),
        por_organizacao: e.orgs.map((o, i) => {
            const s = serieDeRenda(entradaDe(
                e.titulosDoEscopo.filter(t => t.organizationId === o),
                e.locacoesDoEscopo.filter(l => l.organizationId === o),
                e.despesaPorOrg[i] ?? 0,
                e.servicoAtualPorOrg[i] ?? {},
                {},
            )).serie;
            return {
                organization_id: o,
                renda_12m: round2(doze(s).reduce((a, m) => a + m.renda_liquida, 0)),
                servico_12m: round2(doze(s).reduce((a, m) => a + m.servico_atual, 0)),
                divida_total: round2(n0(e.dividaTotalPorOrg[i])),
            };
        }),
    };
}

// ── Escopo GRUPO: quem congela precisa ver todas as orgs ─────────────────────

/**
 * Orgs do escopo de que o usuário NÃO é membro. A RLS devolve vazio — sem erro
 * — para a org que ele não enxerga, e vazio vira zero: a dívida de outra
 * empresa do grupo sumiria e o DSCR consolidado sairia inflado. `minhas` vem
 * de `minhas_orgs_membro()`, a mesma função que a RLS usa.
 */
export function orgsForaDoAcesso(orgs: string[], minhas: string[]): string[] {
    const ok = new Set(minhas);
    return orgs.filter(o => !ok.has(o));
}

/** Mensagem do bloqueio de congelamento quando faltam orgs ao usuário. */
export function mensagemSemAcessoAoGrupo(nomes: string[]): string {
    const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
    return `Você não é membro de ${lista} — só quem é membro de todas as empresas do grupo pode congelar esta versão.`;
}

// ── Renda do mês por empreendimento ──────────────────────────────────────────

/**
 * Renda do mês da data-base de um empreendimento (cartão "renda mensal" do
 * snapshot): títulos de venda em aberto que vencem no mês + aluguel das
 * locações que VIGORAM no mês. Locação que só começa depois não conta (o
 * aluguel dela ainda não existe), e só entra o fluxo que a operação marcou
 * como elegível — o mesmo R8 da série.
 */
export function rendaMensalDoEmpreendimento(
    empreendimentoId: string,
    titulos: TituloCarteira[],
    locacoes: LocacaoVigente[],
    dataBase: string,
    fluxos: FluxosElegiveis,
): number {
    const mes = mesDe(dataBase);
    const vendas = fluxos.vendas
        ? titulos
            .filter(t => t.empreendimentoId === empreendimentoId && t.natureza === 'VENDA' && !t.recebido
                && !!t.dueDate && mesDe(t.dueDate) === mes)
            .reduce((a, t) => a + n0(t.amount), 0)
        : 0;
    const alugueis = fluxos.alugueis
        ? locacoes
            .filter(l => l.empreendimentoId === empreendimentoId && locacaoNoMes(l, mes, dataBase))
            .reduce((a, l) => a + n0(l.aluguelMensal), 0)
        : 0;
    return round2(vendas + alugueis);
}

// ── Contas da tela da capacidade (F2) ────────────────────────────────────────

/** Fluxos elegíveis da operação (R8): vendas = recebíveis, aluguéis = NOI. */
export function fluxosDaOperacao(s: CreditRoomSnapshot): FluxosElegiveis {
    return { vendas: s.operacao.eligible_flows.receivables, alugueis: s.operacao.eligible_flows.noi };
}

export interface ResumoCapacidade {
    /** Média da renda líquida dos 12 primeiros meses da série. */
    renda_liquida_media_12m: number | null;
    /** Menor DSCR não nulo dos 12 primeiros meses; `null` sem nenhum serviço. */
    dscr_minimo_12m: number | null;
    folga_minima_12m: number | null;
    /** 'AAAA-MM' do mês da menor folga. */
    mes_folga_minima: string | null;
    /** No horizonte inteiro, não só nos 12 primeiros. */
    meses_folga_negativa: number;
}

/** Os números-resumo da série congelada. `null` quando a versão não tem capacidade. */
export function resumoDaCapacidade(c: SnapshotCapacidade | null | undefined): ResumoCapacidade | null {
    if (!c) return null;
    const doze = c.serie.slice(0, 12);
    const dscrs = doze.map(m => m.dscr).filter((d): d is number => d !== null);
    const menor = doze.reduce<SerieMes | null>((a, m) => (a === null || m.folga < a.folga ? m : a), null);
    return {
        renda_liquida_media_12m: doze.length
            ? round2(doze.reduce((a, m) => a + m.renda_liquida, 0) / doze.length)
            : null,
        dscr_minimo_12m: dscrs.length ? Math.min(...dscrs) : null,
        folga_minima_12m: menor ? menor.folga : null,
        mes_folga_minima: menor ? menor.mes : null,
        meses_folga_negativa: c.serie.filter(m => m.folga < 0).length,
    };
}

const entre0e100 = (v: number): number => Math.min(100, Math.max(0, n0(v)));

/**
 * Reaplica um cenário de estresse à série CONGELADA e recalcula o valor máximo
 * com os parâmetros congelados. O 1º vencimento é o dia 1 do 1º mês da série —
 * o mesmo que `primeiroVencimentoSimulado` usou ao congelar (dia 1 do mês
 * seguinte à data-base) — então o cenário Base reproduz `c.capacidade_maxima`.
 */
export function estresseDaVersao(
    c: SnapshotCapacidade, cenario: CenarioEstresse, fluxos: FluxosElegiveis,
): ReturnType<typeof aplicarEstresse> & { capacidade_maxima: { parcela_maxima: number; valor_maximo: number } } {
    const preso: CenarioEstresse = {
        ...cenario,
        inadimplencia_pct: entre0e100(cenario.inadimplencia_pct),
        vacancia_pct: entre0e100(cenario.vacancia_pct),
        distrato_pct: entre0e100(cenario.distrato_pct),
    };
    const estressada = aplicarEstresse(c.serie, preso, fluxos);
    const capacidade_maxima = c.serie.length
        ? capacidadeMaxima(estressada.serie, c.parametros, `${c.serie[0].mes}-01`)
        : { parcela_maxima: 0, valor_maximo: 0 };
    return { ...estressada, capacidade_maxima };
}

/** Texto de tela de cada alerta de cadastro: o que é e o que o usuário corrige. */
export const ALERTA_PT: Record<TipoAlerta, { titulo: string; comoResolver: string }> = {
    VENDA_SEM_PARCELAS: {
        titulo: 'Vendas sem parcelas geradas',
        comoResolver: 'Abra o contrato da venda em Comercial › Contratos › Financeiro › Parcelas e use Gerar parcelas.',
    },
    LOCACAO_SEM_VALOR: {
        titulo: 'Locações sem valor de aluguel',
        comoResolver: 'Preencha o valor do aluguel mensal no cadastro do contrato de locação.',
    },
    LOCACAO_PRAZO_INDETERMINADO: {
        titulo: 'Locações com prazo indeterminado',
        comoResolver: 'Informe ou atualize a data de término no cadastro do contrato de locação; sem ela, o aluguel é projetado por todo o horizonte.',
    },
    TITULO_SEM_EMPREENDIMENTO: {
        titulo: 'Títulos sem empreendimento',
        comoResolver: 'Vincule o empreendimento ao título a receber, no lançamento do financeiro; sem ele, o valor não entra no escopo da operação.',
    },
};

const vezesBR = (v: number | null | undefined): string =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

/**
 * As frases da capacidade que a tela (F2) e o book em PDF (F3) dizem IGUAIS:
 * rótulo do DSCR (pós-operação quando a série tem o serviço da operação
 * pedida), "sobre a dívida atual" e a comparação do pedido com o valor máximo.
 * Uma redação só — o banco não pode ler duas versões da mesma conta.
 */
export interface TextosDaCapacidade {
    semSerie: boolean;
    /** A série tem serviço da operação pedida: o DSCR e a folga são pós-operação. */
    comOperacao: boolean;
    rotuloDscr: string;
    /** 'com a operação pedida de R$ X' — `null` sem serviço da operação. */
    apoioOperacao: string | null;
    /** 'pedido R$ X acima/dentro do máximo' — `null` sem pedido ou sem série. */
    comparacaoPedido: string | null;
    hintMaximo: string;
    hintDscr: string | undefined;
    hintFolga: string | undefined;
    /** Frase inteira que explica que o valor máximo não inclui o pedido. */
    notaMaximo: string | null;
}

export function textosDaCapacidade(c: SnapshotCapacidade, resumo: ResumoCapacidade, pedido: number): TextosDaCapacidade {
    const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v));
    const semSerie = c.serie.length === 0;
    const comOperacao = c.serie.some(m => m.servico_novo > 0);
    const dscrExigido = c.parametros.dscr_minimo;
    const apoioOperacao = comOperacao ? `com a operação pedida${pedido > 0 ? ` de ${money(pedido)}` : ''}` : null;
    // A comparação com o pedido vai PRIMEIRO: a dica do KPI corta no fim (KpiStrip do portal),
    // e é ela que desfaz a aparente contradição com o DSCR pós-operação.
    const comparacaoPedido = !semSerie && pedido > 0
        ? `pedido ${money(pedido)} ${pedido > c.capacidade_maxima.valor_maximo ? 'acima do máximo' : 'dentro do máximo'}`
        : null;
    const hintMaximo = semSerie ? 'sem meses projetados nesta versão' : [
        comparacaoPedido,
        'sobre a dívida atual',
        `parcela máx. ${money(c.capacidade_maxima.parcela_maxima)}`,
        `DSCR ≥ ${vezesBR(dscrExigido)}`,
    ].filter(Boolean).join(' · ');
    return {
        semSerie, comOperacao,
        rotuloDscr: comOperacao ? 'DSCR mínimo 12m (pós-operação)' : 'DSCR mínimo 12m',
        apoioOperacao, comparacaoPedido, hintMaximo,
        hintDscr: [
            apoioOperacao,
            resumo.dscr_minimo_12m == null ? 'sem serviço da dívida'
                : resumo.dscr_minimo_12m < dscrExigido ? `abaixo dos ${vezesBR(dscrExigido)} exigidos` : null,
        ].filter(Boolean).join(' · ') || undefined,
        hintFolga: [
            apoioOperacao ? 'com a operação pedida' : null,
            resumo.mes_folga_minima
                ? `${rotuloDoMes(resumo.mes_folga_minima)}${resumo.folga_minima_12m != null && resumo.folga_minima_12m < 0 ? ' · mês no vermelho' : ''}`
                : null,
        ].filter(Boolean).join(' · ') || undefined,
        notaMaximo: comparacaoPedido
            ? `valor máximo calculado sobre a dívida atual; o ${comparacaoPedido}${comOperacao ? ', e o DSCR pós-operação já o inclui' : ''}`
            : null,
    };
}

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM' → 'dez/26'. Só texto: nunca passa por `Date` (fuso). */
export function rotuloDoMes(mes: string): string {
    const [ano, m] = mes.split('-');
    return `${MESES_PT[Number(m) - 1] ?? m}/${(ano ?? '').slice(-2)}`;
}
