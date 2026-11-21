/** Captação pelo dinheiro real (Fase 4 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). */
import { describe, it, expect } from 'vitest';
import { captacaoDaVitrine } from '../utils/oportunidadeCaptacao';

describe('captacaoDaVitrine', () => {
    it('meta = fontes de investidor/SCP da versão, quando houver', () => {
        const c = captacaoDaVitrine({ fontes_de_investidor: 4_000_000, exposicao_maxima: 6_000_000, chamado: 2_000_000, integralizado: 1_000_000, com_spe: true });
        expect(c).toMatchObject({ meta: 4_000_000, origemDaMeta: 'fontes', chamado: 2_000_000, integralizado: 1_000_000, comSpe: true });
        expect(c.pctIntegralizado).toBe(25);
    });

    it('sem fontes, a meta é a exposição máxima congelada', () => {
        const c = captacaoDaVitrine({ fontes_de_investidor: null, exposicao_maxima: 6_000_000 });
        expect(c).toMatchObject({ meta: 6_000_000, origemDaMeta: 'exposicao', integralizado: 0, comSpe: false });
    });

    it('sem versão: sem meta e sem porcentagem; o integralizado nunca passa de 100%', () => {
        expect(captacaoDaVitrine(null)).toMatchObject({ meta: null, origemDaMeta: null, pctIntegralizado: null });
        expect(captacaoDaVitrine({ exposicao_maxima: 100, integralizado: 250 }).pctIntegralizado).toBe(100);
    });
});
