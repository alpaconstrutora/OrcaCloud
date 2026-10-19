// @vitest-environment jsdom
/**
 * Rastreamento logístico no frete FOB (19/10/2026).
 * Plano: docs/planos/2026-10-19-forma-entrega-cif-fob.md
 *
 * No FOB o comprador retira no fornecedor: os passos SHIPPED/DELIVERED se
 * leem "Para retirar"/"Retirado". No CIF nada muda.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import OrderLifeline from '../../components/OrderLifeline';

describe('OrderLifeline · FOB', () => {
    it('FOB mostra "Para retirar" e "Retirado" no lugar de "Em Trânsito" e "Entregue"', () => {
        render(<OrderLifeline status="SHIPPED" fob />);
        expect(screen.getByText('Para retirar')).toBeTruthy();
        expect(screen.getByText('Retirado')).toBeTruthy();
        expect(screen.queryByText('Em Trânsito')).toBeNull();
        expect(screen.queryByText('Entregue')).toBeNull();
        // Os demais passos seguem iguais.
        expect(screen.getByText('Separação')).toBeTruthy();
        expect(screen.getByText('Recebido')).toBeTruthy();
    });

    it('CIF (padrão) segue com "Em Trânsito" e "Entregue"', () => {
        render(<OrderLifeline status="SHIPPED" />);
        expect(screen.getByText('Em Trânsito')).toBeTruthy();
        expect(screen.getByText('Entregue')).toBeTruthy();
        expect(screen.queryByText('Para retirar')).toBeNull();
        expect(screen.queryByText('Retirado')).toBeNull();
    });
});
