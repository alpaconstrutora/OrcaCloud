// @vitest-environment jsdom
/**
 * Conferência do Garden em produção (17/11/2026): o eixo da "Caixa e exposição" saía em formato
 * americano ("R$ 7.0 M", "R$ -3.5 M"), na tela e no PDF, enquanto os outros gráficos do painel usam
 * a régua compacta em pt-BR ("340 mil", "1,6 mi" — `compactAxis`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import { GraficoCurvaS } from '../../components/ImovibGraficos';

// Curva do Garden: exposição até ~-6 mi e acumulado positivo no fim.
const dados = Array.from({ length: 36 }, (_, i) => ({
    name: `Mês ${i + 1}`,
    net: i === 0 ? -3_000_000 : i === 28 ? 6_500_000 : -100_000,
    acc: i < 28 ? -3_000_000 - i * 110_000 : 2_000_000 + (i - 28) * 150_000,
}));

const ticksDoEixoY = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')).map(t => t.textContent ?? '');

describe('Curva S › eixo dos valores', () => {
    it('régua compacta em pt-BR, sem "M" nem ponto decimal', () => {
        const { container } = render(<GraficoCurvaS dados={dados} dimensao={{ largura: 760, altura: 400 }} animado={false} />);
        const ticks = ticksDoEixoY(container);
        expect(ticks.length).toBeGreaterThan(2);
        for (const t of ticks) {
            expect(t).not.toMatch(/ M$/);
            expect(t).not.toMatch(/\d\.\d/);
            expect(t).toMatch(/^(-?\d+(,\d)? mi|-?\d+ mil|0)$/);
        }
    });
});
