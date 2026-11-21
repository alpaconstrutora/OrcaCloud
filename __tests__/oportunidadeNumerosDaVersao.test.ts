/**
 * A vitrine da oportunidade só mostra números da VERSÃO do Imovib (plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 2, decisões D1/D2).
 * Antes (16/11/2026) só VGV/ROI/TIR vinham da versão e o resto era digitado.
 * ROI = "Retorno sobre o capital" do Imovib (lucro ÷ exposição máxima).
 */
import { describe, it, expect } from 'vitest';
import { naVitrine, numerosDaVitrine } from '../utils/oportunidadeNumerosDaVersao';
import type { InvestorOpportunity } from '../services/investorPortalService';

// Números da "Versão de 16/11/2026" do Garden Cambuhy, como estão no banco.
const GARDEN = {
    vgv: 11648000,
    tirAnual: 19.000997240878604,
    lucroLiquido: 2377356.900154821,
    exposicaoMaxima: 6059583.317888486,
    semExposicao: false,
    margemLiquidaPct: 20.41000085984565,
    tma: 12,
    multiplo: 1.4,
};

const base: InvestorOpportunity = { organization_id: 'spe', title: 'Garden Cambuhy', ticket_min: 50000, status: 'estudo' };

describe('naVitrine', () => {
    it('VGV, TIR, ROI, lucro, exposição, TMA e múltiplo da versão', () => {
        const o = naVitrine({ ...base, indicadores_da_versao: GARDEN });
        expect(o.vgv).toBe(11648000);
        expect(o.tir_pct).toBe(GARDEN.tirAnual);
        expect(o.roi_pct).toBeCloseTo((2377356.900154821 / 6059583.317888486) * 100, 6);
        expect(o.lucro_liquido).toBe(GARDEN.lucroLiquido);
        expect(o.exposicao_maxima).toBe(GARDEN.exposicaoMaxima);
        expect(o.tma).toBe(12);
        expect(o.comVersao).toBe(true);
        expect(o.ticket_min).toBe(50000);
    });

    it('prazo e custo total (obra + terreno) dos resultados da versão; local e obra do empreendimento', () => {
        const o = naVitrine({
            ...base,
            indicadores_da_versao: GARDEN,
            resultados_da_versao: { duracao: 48, custoObra: 7_000_000, terreno: 1_500_000 },
            local: { cidade: 'Campinas', uf: 'SP', obra_id: 'obra-1' },
        });
        expect(o.prazo_meses).toBe(48);
        expect(o.custo_total).toBe(8_500_000);
        expect([o.cidade, o.uf, o.obra_id]).toEqual(['Campinas', 'SP', 'obra-1']);
    });

    it('sem versão: nenhum número (rascunho não mostra número digitado nem inventado)', () => {
        const n = numerosDaVitrine({ indicadores_da_versao: null, resultados_da_versao: null, local: null });
        expect(n).toMatchObject({ vgv: null, tir_pct: null, roi_pct: null, prazo_meses: null, custo_total: null, comVersao: false, cidade: null });
    });

    it('TIR inexistente e exposição zero viram null, nunca NaN nem divisão por zero', () => {
        const semTir = naVitrine({ ...base, indicadores_da_versao: { ...GARDEN, tirAnual: null } });
        expect(semTir.tir_pct).toBeNull();
        const semExposicao = naVitrine({ ...base, indicadores_da_versao: { ...GARDEN, exposicaoMaxima: 0, semExposicao: true } });
        expect(semExposicao.roi_pct).toBeNull();
        const prazoZero = naVitrine({ ...base, indicadores_da_versao: GARDEN, resultados_da_versao: { duracao: 0 } });
        expect(prazoZero.prazo_meses).toBeNull();
    });
});
