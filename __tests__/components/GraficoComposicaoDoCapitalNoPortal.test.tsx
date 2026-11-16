// @vitest-environment jsdom
/**
 * Pedido de 16/11/2026: "o gráfico 'De onde vem o dinheiro' usa roxo e índigo, que não são as cores
 * do portal". No Portal do Investidor a rosca usa a paleta do portal (P.capital, validada pelo
 * skill dataviz em todas as combinações de fatias); a prévia do gestor e o PDF seguem com a do app.
 * Três cores ficam abaixo de 3:1 no branco → a legenda leva o percentual (rótulo visível).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import { GraficoComposicaoDoCapital } from '../../components/ImovibGraficos';
import { P } from '../../components/portal/PortalKit';
import { fatiasDoCapital } from '../../utils/imovibGraficos';
import { COR_DO_CAPITAL } from '../../utils/imovibFinanciamento';

const fatias = fatiasDoCapital({ proprio: 630, divida: 0, vendasNaObra: 370, permuta: 0, terceiros: 0 });
const dim = { largura: 420, altura: 300 };
const preenchimentos = (c: HTMLElement) => Array.from(c.querySelectorAll('path')).map(p => p.getAttribute('fill')).filter(Boolean);

describe('rosca "De onde vem o dinheiro"', () => {
    it('com a paleta do portal: coral no capital próprio, azul nas vendas durante a obra', () => {
        const { container } = render(<GraficoComposicaoDoCapital fatias={fatias} dimensao={dim} animado={false} cores={P.capital} />);
        const fills = preenchimentos(container);
        expect(fills).toContain(P.capital.proprio);
        expect(fills).toContain(P.capital.vendasNaObra);
        expect(fills).not.toContain(COR_DO_CAPITAL.proprio);
        expect(fills).not.toContain(COR_DO_CAPITAL.vendasNaObra);
    });

    it('sem paleta: a cor gravada na fatia (app e PDF não mudam)', () => {
        const { container } = render(<GraficoComposicaoDoCapital fatias={fatias} dimensao={dim} animado={false} />);
        expect(preenchimentos(container)).toContain(COR_DO_CAPITAL.proprio);
    });

    it('a legenda diz o percentual de cada fonte', () => {
        render(<GraficoComposicaoDoCapital fatias={fatias} dimensao={dim} animado={false} cores={P.capital} />);
        expect(screen.getByText(/Capital próprio.*63%/)).toBeTruthy();
        expect(screen.getByText(/Vendas durante a obra.*37%/)).toBeTruthy();
    });

    it('a paleta do portal não usa índigo nem roxo', () => {
        for (const cor of Object.values(P.capital)) {
            expect(['#4f46e5', '#8b5cf6', '#6366f1', '#7c3aed']).not.toContain(cor.toLowerCase());
        }
    });
});

describe('painel do investidor passa a paleta certa', () => {
    it('portal → P.capital; prévia do gestor → nenhuma (cor do app)', async () => {
        const recebido: unknown[] = [];
        vi.resetModules();
        vi.doMock('../../components/ImovibGraficos', async (orig) => ({
            ...(await orig<typeof import('../../components/ImovibGraficos')>()),
            GraficoComposicaoDoCapital: (p: { cores?: unknown }) => { recebido.push(p.cores); return null; },
        }));
        vi.doMock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
        const { default: Painel } = await import('../../components/investor/portal/ImovibPainelDoInvestidor');
        const { P: PKit } = await import('../../components/portal/PortalKit');
        const { baseStudy } = await import('../fixtures/imovibEstudos');
        const study = baseStudy() as never;
        render(<Painel versaoPublicada={null} study={study} cenarios={[]} accent="portal" />);
        render(<Painel versaoPublicada={null} study={study} cenarios={[]} accent="indigo" />);
        expect(PKit.capital).toBeTruthy();
        expect(recebido[0]).toEqual(PKit.capital);
        expect(recebido[recebido.length - 1]).toBeUndefined();
        vi.doUnmock('../../components/ImovibGraficos');
    });
});
