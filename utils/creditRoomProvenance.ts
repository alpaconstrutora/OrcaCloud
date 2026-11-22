/**
 * Proveniência dos indicadores — PRD §96.
 *
 * O produto não é o número, é a **rastreabilidade** dele. Um LTC de 47% num
 * PDF é uma afirmação; o mesmo 47% com "dívida R$ 12,4M (7 contratos, posição
 * de 07/09) ÷ orçado R$ 26,3M (projects.budget da obra X)" é uma evidência —
 * e é isso que encurta a due diligence.
 *
 * ── Por que puro, e por que ligado ao snapshot ──────────────────────────────
 *
 * A explicação sai do MESMO snapshot congelado que produziu o número. Se
 * lesse dado vivo, a conta exibida poderia não fechar com o valor mostrado ao
 * lado — e uma explicação que não fecha destrói exatamente a confiança que ela
 * existe para construir.
 *
 * Cada termo carrega `fonte`: a tabela/serviço de onde veio, não uma descrição
 * genérica. É a diferença entre "receita" e "vw_receivables, 344 parcelas".
 */

import type { CreditRoomIndicators, CreditRoomSnapshot } from './creditRoomSnapshot';
import { ELIGIBLE_FLOW_PT } from './creditRoomSnapshot';
import { resumoDaCapacidade, rotuloDoMes } from './creditCapacity';
import { round2 } from './financialMath';

export type IndicadorKey =
    | 'ltv_atual' | 'ltv_pos'
    | 'ltc_atual' | 'ltc_pos'
    | 'dscr_atual' | 'dscr_pos'
    | 'equity_pct'
    | 'cobertura_atual' | 'cobertura_pos'
    | 'divida_pos'
    // Schema 2 — tela da capacidade de pagamento.
    | 'renda_liquida_media' | 'dscr_minimo_12m' | 'capacidade_maxima' | 'folga_minima';

export interface TermoProveniencia {
    rotulo: string;
    /** `null` = a fonte não respondeu. A tela mostra "—", nunca zero. */
    valor: number | null;
    formato: 'money' | 'pct' | 'vezes' | 'numero';
    /** De onde o número veio, no nível de tabela/serviço. */
    fonte: string;
    obs?: string;
    /** Valor que não é número (ex.: 'SAC'). Quando presente, a tela mostra este texto no lugar do valor formatado. */
    texto?: string;
}

export interface Proveniencia {
    titulo: string;
    /** A conta, escrita como se lê. */
    formula: string;
    /** O que significa — uma linha, sem jargão de banco. */
    significado: string;
    termos: TermoProveniencia[];
    resultado: { valor: number | null; formato: TermoProveniencia['formato'] };
    /** Ressalvas que mudam a leitura do número. Vazio quando não há. */
    ressalvas: string[];
}

const m = (rotulo: string, valor: number | null, fonte: string, obs?: string): TermoProveniencia =>
    ({ rotulo, valor, formato: 'money', fonte, obs });

/**
 * Ressalvas que valem para QUALQUER indicador que use o bloco. Ficam aqui e
 * não espalhadas por caso porque uma ressalva esquecida num indicador é pior
 * que nenhuma: sugere que ali o dado é firme.
 */
function ressalvasDaDivida(s: CreditRoomSnapshot): string[] {
    if (!s.divida) return ['A posição da dívida não pôde ser lida — o indicador não tem denominador.'];
    return [`Posição de ${s.divida.data_base}, ${s.divida.n_contratos} contrato(s) em ${s.divida.n_instituicoes} instituição(ões).`];
}

function ressalvasDoCusto(s: CreditRoomSnapshot): string[] {
    const r: string[] = [];
    // A primeira ressalva é a origem: sem ela o analista pode ler uma
    // estimativa declarada como se fosse orçamento fechado.
    if (s.obra?.orcado_origem === 'VALOR_ESTIMADO') {
        r.push(
            `O custo total é a ESTIMATIVA declarada da obra, não orçamento detalhado — `
            + `o detalhado lançado até agora soma ${s.obra.orcado_detalhado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
        );
    }
    if (!s.obra) {
        r.push('Nenhuma obra vinculada à operação — sem custo total, o indicador fica indisponível.');
    } else if (s.obra.orcado <= 0) {
        r.push('A obra vinculada está com orçamento zerado. Pode ser que o orçamento viva no projeto-orçamento gêmeo, e não na obra.');
    }
    if (s.eac?.eac != null && s.obra && s.obra.orcado > 0 && s.eac.eac > s.obra.orcado) {
        r.push(`O EAC projeta ${s.eac.desvio_pct?.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% acima do orçado — o custo total usado aqui é o ORÇADO, não o EAC.`);
    }
    return r;
}

const SEM_CAPACIDADE = 'Indisponível: versão congelada antes da capacidade de pagamento — congele uma nova.';

/** Termo da capacidade que não existe numa versão antiga: o número fica "—". */
const semCapacidade = (rotulo: string, formato: TermoProveniencia['formato']): TermoProveniencia =>
    ({ rotulo, valor: null, formato, fonte: 'Capacidade de pagamento (schema 2) — ausente nesta versão' });

const FONTE_SERIE = 'Série mensal da capacidade congelada na versão (12 primeiros meses)';

export function explicarIndicador(
    key: IndicadorKey,
    s: CreditRoomSnapshot,
    i: CreditRoomIndicators,
): Proveniencia {
    const op = s.operacao;

    switch (key) {
        case 'divida_pos':
            return {
                titulo: 'Dívida pós-operação',
                formula: 'dívida atual + valor solicitado',
                significado: 'Quanto a empresa deve hoje, somado ao que está pedindo nesta operação.',
                termos: [
                    m('Dívida atual', i.divida_atual, 'debtAnalyticsService.position — contratos de dívida ativos'),
                    m('Valor solicitado', op.requested_amount, 'credit_rooms.requested_amount'),
                ],
                resultado: { valor: i.divida_pos, formato: 'money' },
                ressalvas: ressalvasDaDivida(s),
            };

        case 'ltc_atual':
        case 'ltc_pos': {
            const pos = key === 'ltc_pos';
            return {
                titulo: pos ? 'LTC pós-operação' : 'LTC atual',
                formula: `${pos ? '(dívida atual + valor solicitado)' : 'dívida atual'} ÷ custo total da obra × 100`,
                significado: 'Quanto da obra está sendo financiado por dívida, e não por capital próprio.',
                termos: [
                    m('Dívida atual', i.divida_atual, 'debtAnalyticsService.position'),
                    ...(pos ? [m('Valor solicitado', op.requested_amount, 'credit_rooms.requested_amount')] : []),
                    m('Custo total', i.custo_total,
                      s.obra?.orcado_origem === 'VALOR_ESTIMADO'
                          ? 'projects.settings.valorEstimado — estimativa declarada'
                          : 'projects.budget da obra e do orçamento vinculado',
                      s.obra ? s.obra.project_name : undefined),
                ],
                resultado: { valor: pos ? i.ltc_pos : i.ltc_atual, formato: 'pct' },
                ressalvas: [...ressalvasDaDivida(s), ...ressalvasDoCusto(s)],
            };
        }

        case 'ltv_atual':
        case 'ltv_pos': {
            const pos = key === 'ltv_pos';
            return {
                titulo: pos ? 'LTV pós-operação' : 'LTV atual',
                formula: `${pos ? '(dívida atual + valor solicitado)' : 'dívida atual'} ÷ garantias (valor bruto) × 100`,
                significado: 'Quanto da dívida está coberto pelo valor de avaliação das garantias.',
                termos: [
                    m('Dívida atual', i.divida_atual, 'debtAnalyticsService.position'),
                    ...(pos ? [m('Valor solicitado', op.requested_amount, 'credit_rooms.requested_amount')] : []),
                    m('Garantias (bruto)', i.garantias_brutas, `credit_rooms.guarantees · ${op.guarantees.length} item(ns)`),
                ],
                resultado: { valor: pos ? i.ltv_pos : i.ltv_atual, formato: 'pct' },
                ressalvas: [
                    ...ressalvasDaDivida(s),
                    ...(op.guarantees.length
                        ? ['O LTV usa o valor BRUTO das garantias. O haircut aparece na cobertura, não aqui.']
                        : ['Nenhuma garantia cadastrada — sem denominador, o LTV fica indisponível.']),
                ],
            };
        }

        case 'cobertura_atual':
        case 'cobertura_pos': {
            const pos = key === 'cobertura_pos';
            return {
                titulo: pos ? 'Cobertura pós-operação' : 'Cobertura atual',
                formula: `garantias elegíveis (após haircut) ÷ ${pos ? 'dívida pós-operação' : 'dívida atual'}`,
                significado: 'Quantas vezes as garantias, já descontadas, cobrem a dívida.',
                termos: [
                    m('Garantias (bruto)', i.garantias_brutas, 'credit_rooms.guarantees'),
                    m('Garantias elegíveis', i.garantias_elegiveis, 'guarantees.value × (1 − haircut_pct)'),
                    m(pos ? 'Dívida pós-operação' : 'Dívida atual', pos ? i.divida_pos : i.divida_atual,
                      'debtAnalyticsService.position' + (pos ? ' + valor solicitado' : '')),
                ],
                resultado: { valor: pos ? i.cobertura_pos : i.cobertura_atual, formato: 'vezes' },
                ressalvas: [
                    ...ressalvasDaDivida(s),
                    ...(op.guarantees.length ? [] : ['Nenhuma garantia cadastrada.']),
                ],
            };
        }

        case 'equity_pct':
            return {
                titulo: 'Equity aportado',
                formula: 'equity já aportado ÷ custo total da obra × 100',
                significado: 'Quanto do custo os sócios já colocaram do próprio bolso.',
                termos: [
                    m('Equity aportado', op.equity_contributed, 'credit_rooms.equity_contributed'),
                    m('Equity comprometido', op.equity_committed, 'credit_rooms.equity_committed',
                      'o que os sócios se comprometeram a aportar'),
                    m('Custo total', i.custo_total,
                      s.obra?.orcado_origem === 'VALOR_ESTIMADO'
                          ? 'projects.settings.valorEstimado — estimativa declarada'
                          : 'projects.budget da obra e do orçamento vinculado'),
                ],
                resultado: { valor: i.equity_pct, formato: 'pct' },
                ressalvas: [
                    ...ressalvasDoCusto(s),
                    ...(op.equity_contributed < op.equity_committed
                        ? [`Faltam aportar ${(op.equity_committed - op.equity_contributed).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} do compromisso.`]
                        : []),
                ],
            };

        case 'dscr_atual':
        case 'dscr_pos': {
            const pos = key === 'dscr_pos';
            const ausentes = (i.fontes_ausentes ?? []).map(
                f => ELIGIBLE_FLOW_PT[f as keyof typeof ELIGIBLE_FLOW_PT] ?? f,
            );
            const ressalvasComuns = [
                // O R8 é o ponto que mais confunde: o DSCR aqui NÃO é o da
                // empresa, é o desta operação. Dizer isso sempre.
                'O fluxo é o elegível DESTA operação — não o EBITDA da empresa (R8).',
                ...(ausentes.length
                    ? [`Marcado como elegível mas sem fonte de dado: ${ausentes.join(', ')}. Esse fluxo NÃO entrou na conta.`]
                    : []),
            ];
            const resultado = { valor: pos ? i.dscr_pos : i.dscr_atual, formato: 'vezes' as const };

            // Schema 2: fluxo e serviço saem da SÉRIE MENSAL da capacidade, não
            // do NOI × 12 nem do servico_365 — explicar com a fonte certa.
            if (s.capacidade) {
                const doze = s.capacidade.serie.slice(0, 12);
                const novoNaSerie = doze.some(mes => (mes.servico_novo ?? 0) !== 0);
                const pc = s.capacidade.parametros;
                const novo = i.servico_pos_anual != null && i.servico_atual_anual != null
                    ? Math.round((i.servico_pos_anual - i.servico_atual_anual) * 100) / 100
                    : null;
                const fonteNovo = novoNaSerie
                    ? (op.novo_servico_12m != null
                        ? 'debtService · cronograma da proposta vinculada, mês a mês (12 primeiros meses da série)'
                        : `buildSchedule · simulado com os parâmetros do room: ${op.requested_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, `
                          + `taxa ${pc.taxa_mensal_pct.toLocaleString('pt-BR')}% a.m., prazo ${pc.prazo_meses} meses, `
                          + `carência ${pc.carencia_meses} meses, ${pc.sistema === 'SAC' ? 'SAC' : 'Price'} (12 primeiros meses da série)`)
                    : 'debtService · primeiras 12 parcelas do contrato vinculado';
                return {
                    titulo: pos ? 'DSCR pós-operação' : 'DSCR atual',
                    formula: `fluxo elegível ÷ serviço da dívida ${pos ? 'atual + nova' : 'atual'} — soma dos 12 primeiros meses da série mensal`,
                    significado: 'Quantas vezes o fluxo de caixa elegível paga as parcelas de dívida dos próximos 12 meses.',
                    termos: [
                        m('Fluxo elegível (12m)', i.fluxo_elegivel_anual,
                          'Série mensal da capacidade: vendas a vencer (vw_receivables) + aluguéis contratados (contracts LOCACAO) − despesa operacional, 12 primeiros meses — só os fluxos marcados nesta operação (R8)'),
                        m('Serviço atual (12m)', i.servico_atual_anual,
                          'fn_debt_schedule_curve · parcelas da dívida atual nos 12 primeiros meses da série'),
                        ...(pos ? [m('Serviço da nova dívida (12m)', novo, fonteNovo)] : []),
                    ],
                    resultado,
                    ressalvas: [
                        ...ressalvasComuns,
                        ...(pos && i.servico_pos_anual == null
                            ? ['Sem serviço da nova dívida (nem cronograma da proposta, nem simulação pelo valor pedido) — o DSCR pós-operação fica indisponível.']
                            : []),
                        ...(pos && novoNaSerie && op.novo_servico_12m == null
                            ? ['O serviço da nova dívida é SIMULADO com os parâmetros do room — não há cronograma de proposta vinculado.']
                            : []),
                        ...ressalvasDaDivida(s),
                    ],
                };
            }

            return {
                titulo: pos ? 'DSCR pós-operação' : 'DSCR atual',
                formula: `fluxo elegível anual ÷ serviço da dívida ${pos ? 'pós-operação' : 'atual'} (12 meses)`,
                significado: 'Quantas vezes o fluxo de caixa elegível paga as parcelas de dívida do ano.',
                termos: [
                    m('Fluxo elegível (12m)', i.fluxo_elegivel_anual,
                      'NOI do portfólio × 12 — só os fluxos marcados nesta operação (R8)'),
                    m('Serviço atual (12m)', i.servico_atual_anual, 'debtAnalyticsService.position · servico_365'),
                    ...(pos ? [m('Serviço da nova dívida (12m)', op.novo_servico_12m ?? null,
                                 'debtService · primeiras 12 parcelas do contrato vinculado')] : []),
                ],
                resultado,
                ressalvas: [
                    ...ressalvasComuns,
                    ...(pos && op.novo_servico_12m == null
                        ? ['Nenhum contrato de dívida vinculado à operação — sem o serviço da nova dívida, o DSCR pós-operação fica indisponível.']
                        : []),
                    ...ressalvasDaDivida(s),
                ],
            };
        }

        case 'renda_liquida_media':
        case 'dscr_minimo_12m':
        case 'folga_minima':
        case 'capacidade_maxima':
            return explicarCapacidade(key, s);
    }
}

/**
 * Indicadores da tela da capacidade. Saem sempre do snapshot congelado
 * (`s.capacidade`): versão do schema 1 não tem série, então o valor é `null`
 * com ressalva — nunca zero.
 */
function explicarCapacidade(
    key: 'renda_liquida_media' | 'dscr_minimo_12m' | 'folga_minima' | 'capacidade_maxima',
    s: CreditRoomSnapshot,
): Proveniencia {
    const c = s.capacidade;
    const r = resumoDaCapacidade(c);
    const doze = c ? c.serie.slice(0, 12) : [];

    switch (key) {
        case 'renda_liquida_media': {
            const soma = c ? round2(doze.reduce((a, x) => a + x.renda_liquida, 0)) : null;
            return {
                titulo: 'Renda líquida média (12 meses)',
                formula: 'soma da renda líquida dos 12 primeiros meses ÷ número de meses',
                significado: 'Quanto de caixa elegível entra por mês, em média, depois da despesa operacional.',
                termos: c ? [
                    m('Renda líquida (soma dos meses)', soma,
                      `${FONTE_SERIE} — vendas a vencer + aluguéis contratados − despesa operacional, só os fluxos elegíveis (R8)`),
                    { rotulo: 'Meses considerados', valor: doze.length, formato: 'numero', fonte: FONTE_SERIE },
                ] : [semCapacidade('Renda líquida (soma dos meses)', 'money')],
                resultado: { valor: r?.renda_liquida_media_12m ?? null, formato: 'money' },
                ressalvas: c
                    ? ['A renda é a CONTRATADA (títulos a vencer e contratos de locação); o que já venceu e não foi pago fica fora da série.']
                    : [SEM_CAPACIDADE],
            };
        }

        case 'dscr_minimo_12m': {
            const comServico = doze.filter(x => x.dscr !== null);
            const pior = comServico.reduce<(typeof doze)[number] | null>(
                (a, x) => (a === null || (x.dscr as number) < (a.dscr as number) ? x : a), null);
            const mesPior = pior ? rotuloDoMes(pior.mes) : undefined;
            return {
                titulo: 'DSCR mínimo (12 meses)',
                formula: 'menor valor mensal de renda líquida ÷ serviço da dívida (atual + nova), nos 12 primeiros meses',
                significado: 'O pior mês do primeiro ano: quantas vezes a renda daquele mês paga as parcelas dele.',
                termos: c ? [
                    m('Renda líquida do mês crítico', pior?.renda_liquida ?? null, FONTE_SERIE, mesPior),
                    m('Serviço da dívida do mês crítico', pior ? pior.servico_atual + pior.servico_novo : null,
                      `${FONTE_SERIE} — parcelas da dívida atual + nova`, mesPior),
                ] : [semCapacidade('Renda líquida do mês crítico', 'money'), semCapacidade('Serviço da dívida do mês crítico', 'money')],
                resultado: { valor: r?.dscr_minimo_12m ?? null, formato: 'vezes' },
                ressalvas: c
                    ? [
                        'Mês sem serviço da dívida não tem DSCR (aparece como "—") e não entra no mínimo.',
                        ...(comServico.length
                            ? []
                            : ['Nenhum dos 12 primeiros meses tem serviço da dívida — o DSCR mínimo fica indisponível, não é "sem risco".']),
                    ]
                    : [SEM_CAPACIDADE],
            };
        }

        case 'folga_minima':
            return {
                titulo: 'Folga mínima (12 meses)',
                formula: 'menor valor mensal de renda líquida − serviço da dívida (atual + nova), nos 12 primeiros meses',
                significado: 'O mês mais apertado do primeiro ano: quanto sobra (ou falta) depois de pagar as parcelas.',
                termos: c ? [
                    m('Folga do mês mais apertado', r?.folga_minima_12m ?? null, FONTE_SERIE,
                      r?.mes_folga_minima ? rotuloDoMes(r.mes_folga_minima) : undefined),
                    { rotulo: 'Meses com folga negativa (horizonte inteiro)', valor: r?.meses_folga_negativa ?? 0, formato: 'numero',
                      fonte: 'Série mensal da capacidade congelada na versão (horizonte inteiro)' },
                ] : [semCapacidade('Folga do mês mais apertado', 'money')],
                resultado: { valor: r?.folga_minima_12m ?? null, formato: 'money' },
                ressalvas: c ? [] : [SEM_CAPACIDADE],
            };

        case 'capacidade_maxima': {
            const p = c?.parametros;
            const FONTE_PARAM = 'Parâmetros congelados na versão (capacidade.parametros)';
            return {
                titulo: 'Capacidade máxima de nova dívida',
                formula: 'maior principal cuja parcela, conferida mês a mês no horizonte, mantém renda líquida ÷ (serviço atual + parcela) ≥ DSCR mínimo exigido',
                significado: 'Quanto de dívida nova cabe na renda projetada sem passar do DSCR mínimo em nenhum mês.',
                termos: c && p ? [
                    { rotulo: 'DSCR mínimo exigido', valor: p.dscr_minimo, formato: 'vezes', fonte: FONTE_PARAM },
                    { rotulo: 'Taxa mensal', valor: p.taxa_mensal_pct, formato: 'pct', fonte: FONTE_PARAM, obs: `${p.taxa_mensal_pct.toLocaleString('pt-BR')}% a.m.` },
                    { rotulo: 'Prazo', valor: p.prazo_meses, formato: 'numero', fonte: FONTE_PARAM, obs: `${p.prazo_meses} meses` },
                    { rotulo: 'Carência', valor: p.carencia_meses, formato: 'numero', fonte: FONTE_PARAM, obs: `${p.carencia_meses} meses` },
                    { rotulo: 'Sistema de amortização', valor: null, formato: 'numero', fonte: FONTE_PARAM, texto: p.sistema === 'SAC' ? 'SAC' : 'Price' },
                    m('Parcela máxima', c.capacidade_maxima.parcela_maxima,
                      'capacidadeMaxima: busca sobre a série mensal congelada + parâmetros congelados (horizonte inteiro)',
                      'a menor folga mensal contra o DSCR mínimo'),
                ] : [
                    semCapacidade('DSCR mínimo exigido', 'vezes'), semCapacidade('Taxa mensal', 'pct'),
                    semCapacidade('Prazo', 'numero'), semCapacidade('Carência', 'numero'),
                    semCapacidade('Sistema de amortização', 'numero'),
                ],
                resultado: { valor: c ? c.capacidade_maxima.valor_maximo : null, formato: 'money' },
                ressalvas: c
                    ? [
                        'O valor é calculado com os parâmetros congelados (taxa, prazo, carência e sistema), em passos de R$ 100.',
                        ...(c.capacidade_maxima.valor_maximo === 0
                            ? ['Valor zero: nada cabe com estes parâmetros — a renda de algum mês do horizonte não cobre o DSCR mínimo com o serviço atual, a folga é menor que o passo de R$ 100 da busca, ou a série está vazia.']
                            : []),
                    ]
                    : [SEM_CAPACIDADE],
            };
        }
    }
}
