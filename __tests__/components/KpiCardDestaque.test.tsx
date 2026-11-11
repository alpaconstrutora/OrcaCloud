// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard, type KpiTendencia } from '../../components/ui/KpiCard';

// Plano: docs/planos/2026-11-10-kpi-card-tendencia-e-historico.md (item 4) · guia §4.5.2

const piorou: KpiTendencia = { texto: '+8,7%', direcao: 'sobe', bom: false, pct: 0.087, base: 'vs. out/26' };

describe('KpiCard destaque — tendência, série e sólido', () => {
    it('sem as props novas, continua o card de hoje (sem linha, sem selo, sem fundo)', () => {
        const { container } = render(<KpiCard destaque label="Vencido a receber" value="R$ 10" tom="alerta" />);
        expect(container.querySelector('svg[viewBox="0 0 200 32"]')).toBeNull();
        expect(container.querySelector('[data-solido]')).toBeNull();
        expect(container.firstElementChild).toHaveClass('bg-white');
        expect(screen.getByText('R$ 10')).toBeInTheDocument();
    });

    it('tendência: seta + texto + base, e "piorou" para leitor de tela', () => {
        render(<KpiCard destaque label="Vencido a receber" value="R$ 10" tendencia={piorou} />);
        expect(screen.getByText('+8,7%')).toHaveClass('text-red-700');
        expect(screen.getByText('vs. out/26')).toBeInTheDocument();
        expect(screen.getByText('(piorou)')).toHaveClass('sr-only');
    });

    it('a cor diz se melhorou, não a direção: a pagar caindo é verde', () => {
        render(<KpiCard destaque label="A pagar" value="R$ 8" tendencia={{ ...piorou, texto: '−20,0%', direcao: 'desce', bom: true }} />);
        expect(screen.getByText('−20,0%')).toHaveClass('text-emerald-700');
        expect(screen.getByText('(melhorou)')).toBeInTheDocument();
    });

    it('série desenha a linha escondida do leitor de tela; menos de 2 pontos medidos não desenha', () => {
        const { container, rerender } = render(<KpiCard destaque label="X" value="1" serie={[1, null, 3, 4]} />);
        const svg = container.querySelector('svg[viewBox="0 0 200 32"]');
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        // o null quebra a linha: só o trecho [3, 4] tem 2+ pontos
        expect(svg!.querySelectorAll('polyline')).toHaveLength(1);
        rerender(<KpiCard destaque label="X" value="1" serie={[null, 4]} />);
        expect(container.querySelector('svg[viewBox="0 0 200 32"]')).toBeNull();
    });

    it('sólido só no alerta; em atenção a prop é ignorada', () => {
        const { container, rerender } = render(<KpiCard destaque label="X" value="1" tom="alerta" solido tendencia={piorou} />);
        expect(container.firstElementChild).toHaveAttribute('data-solido', 'true');
        expect(container.firstElementChild).toHaveClass('bg-red-700');
        expect(screen.getByText('+8,7%')).toHaveClass('text-white');
        rerender(<KpiCard destaque label="X" value="1" tom="atencao" solido />);
        expect(container.firstElementChild).not.toHaveAttribute('data-solido');
        expect(container.firstElementChild).toHaveClass('bg-white');
    });

    it('contagem: sem movimento disponível (jsdom), mostra o valor final direto', () => {
        render(<KpiCard destaque label="X" value="ignorado" contagem={{ alvo: 1234, formatar: v => `R$ ${Math.round(v)}` }} />);
        expect(screen.getByText('R$ 1234')).toBeInTheDocument();
    });
});
