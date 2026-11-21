// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '../../components/ui/KpiCard';

// `size="xs"` — o KPI numa faixa de ferramentas (ribbon do Orçamento Analítico, 21/11/2026).
// Plano: docs/planos/2026-11-21-orcamento-ribbon.md · guia §4.6

describe('KpiCard xs — linha única para faixa de ferramentas', () => {
    it('uma linha h-9: rótulo e valor lado a lado, na cor do KPI', () => {
        const { container } = render(<KpiCard size="xs" label="Preço Final" value="R$ 125,00" color="emerald" />);
        const raiz = container.firstElementChild as HTMLElement;
        expect(raiz.className).toContain('h-9');
        expect(raiz.className).not.toContain('rounded-xl');
        expect(screen.getByText('R$ 125,00')).toHaveClass('text-emerald-700');
        expect(raiz.textContent).toBe('Preço FinalR$ 125,00');
    });

    it('o `sub` não cabe na linha: vai para leitor de tela', () => {
        render(<KpiCard size="xs" label="BDI (0%)" value="+ R$ 0,00" sub="BDI zerado" color="amber" />);
        expect(screen.getByText('BDI zerado')).toHaveClass('sr-only');
    });

    it('clicável vira botão, como o card grande', () => {
        render(<KpiCard size="xs" label="Custo" value="R$ 1" onClick={() => undefined} />);
        expect(screen.getByRole('button', { name: /Custo/ })).toBeInTheDocument();
    });
});
