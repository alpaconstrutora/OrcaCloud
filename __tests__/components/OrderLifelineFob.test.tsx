// @vitest-environment jsdom
/**
 * Rastreamento logístico no frete FOB (19/10/2026).
 * Plano: docs/planos/2026-10-19-forma-entrega-cif-fob.md
 *
 * No FOB o comprador retira no fornecedor e o fornecedor não tem ação na
 * logística: saem Separação e Em Trânsito, e DELIVERED se lê "Retirado".
 * No CIF nada muda.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import OrderLifeline from '../../components/OrderLifeline';

describe('OrderLifeline · FOB', () => {
    it('FOB: sem Separação/Em Trânsito; "Retirado" no lugar de "Entregue"', () => {
        render(<OrderLifeline status="CONFIRMED" fob />);
        expect(screen.getByText('Retirado')).toBeTruthy();
        expect(screen.queryByText('Separação')).toBeNull();
        expect(screen.queryByText('Em Trânsito')).toBeNull();
        expect(screen.queryByText('Entregue')).toBeNull();
        const rotulos = screen.getAllByText(/^(Lances|Confirmado|Retirado|Recebido|Divergência)$/).map(e => e.textContent);
        expect(rotulos).toEqual(['Lances', 'Confirmado', 'Retirado', 'Recebido', 'Divergência']);
    });

    it('FOB: pedido antigo em Em Trânsito fica no passo Confirmado (aguardando retirada)', () => {
        const { container } = render(<OrderLifeline status="SHIPPED" fob estimatedDelivery="12/05/2026" />);
        // A pílula "Prev:" só aparece no passo atual.
        const confirmado = screen.getByText('Confirmado').closest('div.relative');
        expect(confirmado?.textContent).toContain('Prev: 12/05/2026');
        expect(container.textContent).not.toContain('Em Trânsito');
    });

    it('CIF (padrão) segue com "Em Trânsito" e "Entregue"', () => {
        render(<OrderLifeline status="SHIPPED" />);
        expect(screen.getByText('Em Trânsito')).toBeTruthy();
        expect(screen.getByText('Entregue')).toBeTruthy();
        expect(screen.getByText('Separação')).toBeTruthy();
        expect(screen.queryByText('Retirado')).toBeNull();
    });
});
