/**
 * Proveniência (§96).
 *
 * O que estes testes protegem: que a explicação FECHE com o número explicado.
 * Uma proveniência que mostra termos cuja conta dá outro valor é pior que
 * nenhuma — ela destrói exatamente a confiança que existe para construir.
 *
 * E que a ressalva apareça quando muda a leitura: fluxo marcado como elegível
 * sem fonte de dado é o caso que faz um DSCR parecer melhor do que é.
 */

import { describe, expect, it } from 'vitest';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade, type SnapshotInputs } from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, resumoDaCapacidade, type SerieMes } from '../utils/creditCapacity';
import { explicarIndicador, type IndicadorKey } from '../utils/creditRoomProvenance';

// Sem `as any`: o cast escondia nomes de campo errados no próprio fixture, e
// o teste falhava acusando o app por um erro que era dele mesmo.
const base = (over: Partial<SnapshotInputs> = {}) => buildSnapshot({
    dataBase: '2026-09-07',
    operacao: {
        requestedAmount: 5_000_000,
        modality: 'Financiamento à produção',
        eligibleFlows: { noi: true, receivables: false, operating_cash: false },
        guarantees: [{ kind: 'IMOVEL', label: 'Terreno', value: 20_000_000, haircut_pct: 30 }],
        equityCommitted: 4_000_000,
        equityContributed: 3_000_000,
    },
    divida: {
        dataBase: '2026-09-07',
        dividaTotal: 10_000_000, curtoPrazo: 2_000_000, longoPrazo: 8_000_000,
        encargosAPagar: 0, servico90: 600_000, servico365: 2_500_000,
        vencido: 0, custoMedioMensal: 0, prazoMedioMeses: 60,
        nContratos: 7, nInstituicoes: 3,
    },
    obra: {
        projectId: 'p1', projectName: 'Obra X', orcado: 30_000_000,
        contratadoCusto: 0, pago: 0, aPagar: 0, vencidoPagar: 0, avancoFisicoPct: 10,
    },
    portfolio: {
        janelaMeses: 12, receita: 7_000_000, despesa: 1_000_000, noi: 6_000_000,
        margem: 0.85, capRate: 0.09,
    },
    novoServico12m: 900_000,
    documentVersionIds: [],
    ...over,
});

/** A conta que a proveniência PROMETE, refeita a partir dos termos exibidos. */
const valores = (p: ReturnType<typeof explicarIndicador>) =>
    p.termos.map(t => t.valor);

// Os indicadores são arredondados a 2 casas antes de aparecer. Refazer a conta
// com o MESMO arredondamento é o que checa de verdade — afrouxar a tolerância
// deixaria passar um erro de meio centavo por milhão.
const r2 = (v: number) => Math.round(v * 100) / 100;

describe('explicarIndicador', () => {
    const s = base();
    const i = computeIndicators(s);

    it('todo indicador devolve título, fórmula, significado e resultado', () => {
        const chaves: IndicadorKey[] = [
            'ltv_atual', 'ltv_pos', 'ltc_atual', 'ltc_pos',
            'dscr_atual', 'dscr_pos', 'equity_pct',
            'cobertura_atual', 'cobertura_pos', 'divida_pos',
        ];
        for (const k of chaves) {
            const p = explicarIndicador(k, s, i);
            expect(p.titulo, k).toBeTruthy();
            expect(p.formula, k).toBeTruthy();
            expect(p.significado, k).toBeTruthy();
            expect(p.termos.length, k).toBeGreaterThan(0);
            // Todo termo diz DE ONDE veio — "receita" não basta, tem de ser a fonte.
            for (const t of p.termos) expect(t.fonte, `${k}/${t.rotulo}`).toBeTruthy();
        }
    });

    it('🔴 LTC: a conta dos termos exibidos dá o número exibido', () => {
        const p = explicarIndicador('ltc_pos', s, i);
        const [dividaAtual, solicitado, custo] = valores(p);
        expect(r2(((dividaAtual! + solicitado!) / custo!) * 100)).toBe(p.resultado.valor);
        expect(p.resultado.valor).toBe(i.ltc_pos);
    });

    it('🔴 LTV: idem, e usa o valor BRUTO das garantias (não o pós-haircut)', () => {
        const p = explicarIndicador('ltv_pos', s, i);
        const [dividaAtual, solicitado, garantias] = valores(p);
        expect(garantias).toBe(20_000_000);          // bruto, não 14M
        expect(r2(((dividaAtual! + solicitado!) / garantias!) * 100)).toBe(p.resultado.valor);
        expect(p.ressalvas.join(' ')).toMatch(/BRUTO/);
    });

    it('🔴 DSCR pós: fluxo ÷ (serviço atual + serviço da nova dívida)', () => {
        const p = explicarIndicador('dscr_pos', s, i);
        const [fluxo, servicoAtual, servicoNovo] = valores(p);
        expect(fluxo).toBe(6_000_000);               // NOI 500k × 12
        expect(r2(fluxo! / (servicoAtual! + servicoNovo!))).toBe(p.resultado.valor);
        expect(p.resultado.valor).toBe(i.dscr_pos);
    });

    it('🔴 DSCR: fluxo marcado como elegível SEM fonte vira ressalva explícita', () => {
        // Recebíveis marcado, mas o motor não soma esse fluxo: sem o aviso, o
        // DSCR pareceria apurado sobre uma base maior do que a usada.
        const s2 = base({
            operacao: {
                requestedAmount: 5_000_000,
                eligibleFlows: { noi: true, receivables: true, operating_cash: false },
                guarantees: [], equityCommitted: 0, equityContributed: 0,
            },
        });
        const i2 = computeIndicators(s2);
        const p = explicarIndicador('dscr_pos', s2, i2);
        expect(i2.fontes_ausentes).toContain('receivables');
        expect(p.ressalvas.join(' ')).toMatch(/NÃO entrou na conta/);
    });

    it('DSCR sempre avisa que o fluxo é o DESTA operação (R8)', () => {
        expect(explicarIndicador('dscr_atual', s, i).ressalvas.join(' ')).toMatch(/R8/);
    });

    it('sem garantia, o LTV não inventa denominador — resultado null e ressalva', () => {
        const s2 = base({
            operacao: {
                requestedAmount: 5_000_000,
                eligibleFlows: { noi: true, receivables: false, operating_cash: false },
                guarantees: [], equityCommitted: 0, equityContributed: 0,
            },
        });
        const p = explicarIndicador('ltv_pos', s2, computeIndicators(s2));
        expect(p.resultado.valor).toBeNull();
        expect(p.ressalvas.join(' ')).toMatch(/Nenhuma garantia/);
    });

    it('sem obra, o LTC diz que falta o denominador em vez de mostrar 0%', () => {
        const s2 = base({ obra: undefined });
        const p = explicarIndicador('ltc_pos', s2, computeIndicators(s2));
        expect(p.resultado.valor).toBeNull();
        expect(p.ressalvas.join(' ')).toMatch(/Nenhuma obra vinculada/);
    });

    it('equity: mostra o que falta aportar do compromisso', () => {
        const p = explicarIndicador('equity_pct', s, i);
        expect(p.resultado.valor).toBe(10);   // 3M ÷ 30M
        expect(p.ressalvas.join(' ')).toMatch(/Faltam aportar/);
    });
});

// ── Schema 2: DSCR pela série mensal ─────────────────────────────────────────

const serie12 = (over: Partial<SerieMes> = {}): SerieMes[] =>
    Array.from({ length: 12 }, (_, k) => ({
        mes: `2026-${String(k + 1).padStart(2, '0')}`,
        vendas: 6_000, alugueis: 4_000, despesa_operacional: 0,
        renda_liquida: 10_000, servico_atual: 5_000, servico_novo: 0,
        folga: 5_000, dscr: 2, ...over,
    }));

const capacidade = (serie: SerieMes[]): SnapshotCapacidade => ({
    fonte: 'creditCapacity', data_base: '2026-09-07',
    parametros: { ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 1.5, prazo_meses: 48, carencia_meses: 6, sistema: 'SAC' },
    base: 'CONTRATADA', serie, recebido_12m: [], vencido_na_data_base: 0, a_vencer_mes_corrente: 0,
    estoque: null, capacidade_maxima: { parcela_maxima: 0, valor_maximo: 0 }, alertas: [], por_organizacao: [],
});

describe('explicarIndicador — schema 2 (série mensal)', () => {
    it('🔴 DSCR pós SIMULADO: nomeia a série, a curva e os parâmetros do room — e a conta fecha', () => {
        const s2 = base({ novoServico12m: null, capacidade: capacidade(serie12({ servico_novo: 2_500 })) });
        const i2 = computeIndicators(s2);
        const p = explicarIndicador('dscr_pos', s2, i2);
        const [fluxo, atual, novo] = valores(p);
        expect([fluxo, atual, novo]).toEqual([120_000, 60_000, 30_000]);
        expect(r2(fluxo! / (atual! + novo!))).toBe(p.resultado.valor);
        expect(p.resultado.valor).toBe(i2.dscr_pos);
        const fontes = p.termos.map(t => t.fonte).join(' | ');
        expect(fontes).toMatch(/vendas a vencer/);
        expect(fontes).toMatch(/aluguéis contratados/);
        expect(fontes).toMatch(/despesa operacional/);
        expect(fontes).toMatch(/fn_debt_schedule_curve/);
        expect(fontes).toMatch(/simulado com os parâmetros do room/);
        expect(fontes).toMatch(/taxa 1,5% a\.m\., prazo 48 meses, carência 6 meses, SAC/);
        // nada do caminho antigo
        expect(fontes).not.toMatch(/NOI do portfólio × 12|servico_365/);
        const ressalvas = p.ressalvas.join(' ');
        expect(ressalvas).not.toMatch(/Nenhum contrato de dívida vinculado/);
        expect(ressalvas).toMatch(/SIMULADO/);
    });

    it('DSCR pós com proposta vinculada: o serviço novo vem do cronograma dela', () => {
        const s2 = base({ novoServico12m: 30_000, capacidade: capacidade(serie12({ servico_novo: 2_500 })) });
        const p = explicarIndicador('dscr_pos', s2, computeIndicators(s2));
        expect(p.termos[2].fonte).toMatch(/cronograma da proposta vinculada/);
        expect(p.ressalvas.join(' ')).not.toMatch(/SIMULADO/);
    });

    it('DSCR pós sem serviço novo nenhum: null e ressalva própria do schema 2', () => {
        const s2 = base({ novoServico12m: null, capacidade: capacidade(serie12()) });
        const p = explicarIndicador('dscr_pos', s2, computeIndicators(s2));
        expect(p.resultado.valor).toBeNull();
        expect(p.termos[2].valor).toBeNull();
        expect(p.ressalvas.join(' ')).toMatch(/nem cronograma da proposta, nem simulação/);
    });

    it('DSCR atual do schema 2 não fala em NOI × 12 nem em servico_365', () => {
        const s2 = base({ capacidade: capacidade(serie12()) });
        const p = explicarIndicador('dscr_atual', s2, computeIndicators(s2));
        expect(p.termos).toHaveLength(2);
        expect(p.termos.map(t => t.fonte).join(' ')).not.toMatch(/NOI do portfólio × 12|servico_365/);
        expect(p.resultado.valor).toBe(2);
        expect(p.ressalvas.join(' ')).toMatch(/R8/);
    });

    it('schema 1 (sem capacidade) mantém a explicação antiga', () => {
        const p = explicarIndicador('dscr_pos', base(), computeIndicators(base()));
        expect(p.termos[0].fonte).toBe('NOI do portfólio × 12 — só os fluxos marcados nesta operação (R8)');
        expect(p.termos[1].fonte).toBe('debtAnalyticsService.position · servico_365');
    });
});

// ── Schema 2: indicadores da tela da capacidade ──────────────────────────────

describe('explicarIndicador — indicadores da capacidade', () => {
    const serie = serie12().map((m, k) => ({ ...m, renda_liquida: 10_000 + k * 1_000, folga: k === 3 ? -200 : 5_000, dscr: k === 5 ? 1.1 : 2 }));
    const cap = { ...capacidade(serie), capacidade_maxima: { parcela_maxima: 4_321, valor_maximo: 123_400 } };
    const s2 = base({ capacidade: cap });
    const i2 = computeIndicators(s2);
    const resumo = resumoDaCapacidade(cap)!;

    it('capacidade máxima: resultado é o valor congelado; a fórmula é mês a mês e os termos trazem os parâmetros', () => {
        const p = explicarIndicador('capacidade_maxima', s2, i2);
        expect(p.resultado).toEqual({ valor: 123_400, formato: 'money' });
        expect(p.formula).toMatch(/mês a mês/);
        const termos = p.termos.map(t => `${t.rotulo} ${t.fonte} ${t.obs ?? ''}`).join(' | ');
        expect(termos).toMatch(/DSCR mínimo/);
        expect(termos).toMatch(/[Tt]axa/);
        expect(termos).toMatch(/[Pp]razo/);
        expect(termos).toMatch(/[Cc]arência/);
        expect(termos).toMatch(/[Ss]istema/);
        const valoresPorRotulo = Object.fromEntries(p.termos.map(t => [t.rotulo, t.valor]));
        expect(valoresPorRotulo['DSCR mínimo exigido']).toBe(cap.parametros.dscr_minimo);
        expect(valoresPorRotulo['Taxa mensal']).toBe(1.5);
        expect(valoresPorRotulo['Prazo']).toBe(48);
        expect(valoresPorRotulo['Carência']).toBe(6);
        const sistema = p.termos.find(t => t.rotulo === 'Sistema de amortização');
        expect(sistema?.texto).toBe('SAC');
        expect(sistema?.valor).toBeNull();
    });

    it('DSCR mínimo e renda média batem com o resumo da série', () => {
        const d = explicarIndicador('dscr_minimo_12m', s2, i2);
        expect(d.resultado).toEqual({ valor: resumo.dscr_minimo_12m, formato: 'vezes' });
        expect(d.resultado.valor).toBe(1.1);
        const r = explicarIndicador('renda_liquida_media', s2, i2);
        expect(r.resultado).toEqual({ valor: resumo.renda_liquida_media_12m, formato: 'money' });
        expect(r.resultado.valor).toBe(15_500);
    });

    it('folga mínima: valor e mês da menor folga', () => {
        const p = explicarIndicador('folga_minima', s2, i2);
        expect(p.resultado).toEqual({ valor: -200, formato: 'money' });
        expect(p.termos.map(t => t.obs ?? '').join(' ')).toMatch(/abr\/26/);
    });

    it('versão sem capacidade (schema 1): valor null e ressalva de versão antiga nas quatro chaves', () => {
        const s1 = base();
        const chaves: IndicadorKey[] = ['renda_liquida_media', 'dscr_minimo_12m', 'capacidade_maxima', 'folga_minima'];
        for (const k of chaves) {
            const p = explicarIndicador(k, s1, computeIndicators(s1));
            expect(p.resultado.valor, k).toBeNull();
            expect(p.ressalvas.join(' '), k).toContain('versão congelada antes da capacidade de pagamento — congele uma nova');
            expect(p.termos.length, k).toBeGreaterThan(0);
        }
    });

    it('sem serviço no período, o DSCR mínimo é null (nunca zero) e diz por quê', () => {
        const semServico = base({ capacidade: capacidade(serie12({ servico_atual: 0, dscr: null, folga: 10_000 })) });
        const p = explicarIndicador('dscr_minimo_12m', semServico, computeIndicators(semServico));
        expect(p.resultado.valor).toBeNull();
        expect(p.ressalvas.join(' ')).toMatch(/sem serviço da dívida/);
    });
});
