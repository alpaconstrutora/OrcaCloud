// @vitest-environment jsdom
/**
 * Portal do fornecedor › Pedidos: status de pedido FOB pelo rótulo do FOB
 * (19/10/2026) — "Entregue" se lê "Retirado"; CIF segue igual.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import PortalOrders from '../../components/supplier/portal/PortalOrders';
import type { PurchaseOrder } from '../../types';

const pedido = (id: string, status: string, deliveryMethod: string) => ({
    id, number: id, status, deliveryMethod, items: [], created_at: '2026-10-19', projectName: 'Obra',
}) as unknown as PurchaseOrder;

describe('PortalOrders · status FOB', () => {
    beforeEach(() => localStorage.clear());

    it('FOB Entregue aparece "Retirado"; CIF Entregue continua "Entregue"', () => {
        render(
            <PortalOrders
                orders={[pedido('PCO-FOB', 'Entregue', 'FOB - Retirada por conta do comprador'), pedido('PCO-CIF', 'Entregue', 'CIF - Entrega por conta do fornecedor')]}
                invoices={[]}
                loading={false}
                onOpenOrder={() => {}}
            />,
        );
        expect(screen.getAllByText('Retirado').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Entregue').length).toBeGreaterThan(0);
    });
});
