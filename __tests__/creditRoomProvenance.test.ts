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
import { buildSnapshot, computeIndicators, type SnapshotInputs } from '../utils/creditRoomSnapshot';
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
