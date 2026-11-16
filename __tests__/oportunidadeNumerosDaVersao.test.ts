/**
 * Oportunidade com versão do Imovib publicada: VGV, ROI e TIR que o investidor e o gestor veem nas
 * listas vêm da VERSÃO (pedido do usuário, 16/11/2026: "VGV, ROI, TIR e Ticket mínimo não são
 * gerados no Imovib?" → "sim"). ROI = "Retorno sobre o capital" do Imovib (lucro ÷ exposição
 * máxima). Ticket mínimo e status não existem no estudo: continuam os do formulário.
 */
import { describe, it, expect } from 'vitest';
import { comNumerosDaVersao } from '../utils/oportunidadeNumerosDaVersao';
import type { InvestorOpportunity } from '../services/investorPortalService';

// Números da "Versão de 16/11/2026" do Garden Cambuhy, como estão no banco.
const GARDEN = {
    vgv: 11648000,
    tirAnual: 19.000997240878604,
    lucroLiquido: 2377356.900154821,
    exposicaoMaxima: 6059583.317888486,
    semExposicao: false,
    margemLiquidaPct: 20.41000085984565,
};

const base: InvestorOpportunity = { organization_id: 'spe', title: 'Garden Cambuhy', ticket_min: 50000, status: 'estudo' };

describe('comNumerosDaVersao', () => {
    it('com versão: VGV, TIR e ROI (retorno sobre o capital) da versão', () => {
        const o = comNumerosDaVersao({ ...base, indicadores_da_versao: GARDEN });
        expect(o.vgv).toBe(11648000);
        expect(o.tir_pct).toBeCloseTo(19.0, 1);
        expect(o.roi_pct).toBeCloseTo(39.23, 2);
    });

    it('com versão: a versão vale mais que o digitado à mão', () => {
        const o = comNumerosDaVersao({ ...base, vgv: 1, roi_pct: 2, tir_pct: 3, indicadores_da_versao: GARDEN });
        expect(o.vgv).toBe(11648000);
        expect(o.roi_pct).toBeCloseTo(39.23, 2);
        expect(o.tir_pct).toBeCloseTo(19.0, 1);
    });

    it('ticket mínimo e status continuam os do formulário', () => {
        const o = comNumerosDaVersao({ ...base, indicadores_da_versao: GARDEN });
        expect(o.ticket_min).toBe(50000);
        expect(o.status).toBe('estudo');
    });

    it('sem versão: os números digitados à mão, objeto intacto', () => {
        const manual = { ...base, vgv: 100, roi_pct: 10, tir_pct: 12 };
        expect(comNumerosDaVersao(manual)).toBe(manual);
        expect(comNumerosDaVersao({ ...manual, indicadores_da_versao: null })).toMatchObject({ vgv: 100, roi_pct: 10, tir_pct: 12 });
    });

    it('versão sem TIR ou sem exposição: "—" (null), nunca o número manual nem NaN/Infinity', () => {
        const semTir = comNumerosDaVersao({ ...base, tir_pct: 12, indicadores_da_versao: { ...GARDEN, tirAnual: null } });
        expect(semTir.tir_pct).toBeNull();
        const semExposicao = comNumerosDaVersao({ ...base, roi_pct: 10, indicadores_da_versao: { ...GARDEN, exposicaoMaxima: 0, semExposicao: true } });
        expect(semExposicao.roi_pct).toBeNull();
    });

    it('versão gravada sem algum indicador (jsonb antigo): esse vira null', () => {
        const o = comNumerosDaVersao({ ...base, vgv: 5, indicadores_da_versao: { tirAnual: 15 } });
        expect(o.vgv).toBeNull();
        expect(o.roi_pct).toBeNull();
        expect(o.tir_pct).toBe(15);
    });
});
