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

export type IndicadorKey =
    | 'ltv_atual' | 'ltv_pos'
    | 'ltc_atual' | 'ltc_pos'
    | 'dscr_atual' | 'dscr_pos'
    | 'equity_pct'
    | 'cobertura_atual' | 'cobertura_pos'
    | 'divida_pos';

export interface TermoProveniencia {
    rotulo: string;
    /** `null` = a fonte não respondeu. A tela mostra "—", nunca zero. */
    valor: number | null;
    formato: 'money' | 'pct' | 'vezes' | 'numero';
    /** De onde o número veio, no nível de tabela/serviço. */
    fonte: string;
    obs?: string;
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
                resultado: { valor: pos ? i.dscr_pos : i.dscr_atual, formato: 'vezes' },
                ressalvas: [
                    // O R8 é o ponto que mais confunde: o DSCR aqui NÃO é o da
                    // empresa, é o desta operação. Dizer isso sempre.
                    'O fluxo é o elegível DESTA operação — não o EBITDA da empresa (R8).',
                    ...(ausentes.length
                        ? [`Marcado como elegível mas sem fonte de dado: ${ausentes.join(', ')}. Esse fluxo NÃO entrou na conta.`]
                        : []),
                    ...(pos && op.novo_servico_12m == null
                        ? ['Nenhum contrato de dívida vinculado à operação — sem o serviço da nova dívida, o DSCR pós-operação fica indisponível.']
                        : []),
                    ...ressalvasDaDivida(s),
                ],
            };
        }
    }
}
