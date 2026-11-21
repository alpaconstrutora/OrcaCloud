// @vitest-environment jsdom
/**
 * Simulador honesto (item 2.4 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md):
 * sem versão não aparece (antes: custo R$ 58 mi, VGV R$ 92 mi, TIR 18,4%, ROI 62% e CDI 10,5% fixos).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InvestmentSimulator, simular, podeSimular } from '../../components/investor/InvestmentSimulator';
import { numerosDaVitrine } from '../../utils/oportunidadeNumerosDaVersao';

const GARDEN = numerosDaVitrine({
    indicadores_da_versao: { vgv: 11_648_000, lucroLiquido: 2_000_000, exposicaoMaxima: 8_000_000, semExposicao: false, tma: 12 },
    resultados_da_versao: { duracao: 36 },
    local: null,
});

describe('simulador de aporte', () => {
    it('sem versão: não renderiza nada (nenhum número inventado)', () => {
        const vazio = numerosDaVitrine({ indicadores_da_versao: null, resultados_da_versao: null, local: null });
        expect(podeSimular(vazio)).toBe(false);
        const { container } = render(<InvestmentSimulator numeros={vazio} />);
        expect(container.textContent).toBe('');
        expect(container.textContent).not.toMatch(/92\.000\.000|58\.000\.000|18,4|10,5/);
    });

    it('participação e lucro proporcionais à versão; régua = TMA do estudo no prazo', () => {
        const r = simular(800_000, GARDEN);
        expect(r.participacaoPct).toBeCloseTo(10, 10);
        expect(r.retorno).toBeCloseTo(200_000, 6);
        expect(r.naTma).toBeCloseTo(800_000 * (Math.pow(1.12, 3) - 1), 6);
    });

    it('com versão: mostra os números e diz que é simulação, com o ticket mínimo como valor inicial', () => {
        render(<InvestmentSimulator numeros={GARDEN} ticketMinimo={800_000} versao="Comitê de novembro" />);
        expect(screen.getByText('10%')).toBeTruthy();
        expect(screen.getByText(/R\$\s?200\.000/)).toBeTruthy();
        expect(screen.getByText(/versão "Comitê de novembro"/)).toBeTruthy();
        expect(screen.getByText(/não promessa de rentabilidade/)).toBeTruthy();
    });
});
