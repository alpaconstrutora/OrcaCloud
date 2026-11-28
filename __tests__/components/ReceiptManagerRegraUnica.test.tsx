// @vitest-environment jsdom
/**
 * Suprimentos › Recebimento no COMPUTADOR na mesma regra do celular (Fase 6,
 * docs/planos/2026-11-27-recebimento-mobile.md; decisões do usuário de 28/11/2026):
 *   · a lista recorta pela organização do topo (REGRA #5);
 *   · "Conferir e receber" segue lib/recebimento.ts — CIF já "Em Trânsito", FOB só retirado;
 *   · o "Editar Checkout" de pedido já conferido saiu.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const cadeia = vi.hoisted(() => {
    const c: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'in', 'order', 'limit', 'or', 'is']) c[k] = () => c;
    c.then = (r: (v: { data: unknown[]; error: null }) => void) => r({ data: [], error: null });
    return c;
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => cadeia, rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() } } }));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org1' }) }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { mapObrasToEmpreendimentos: vi.fn(async () => ({})) } }));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'razao' }) } }));

const FOB = 'FOB - Retirada por conta do comprador';
const pedido = (id: string, status: string, organizationId: string, deliveryMethod?: string) => ({
    id, number: `PC-${id}`, supplierName: 'Casa do Cimento', status, organizationId, organizationName: organizationId,
    projectName: 'Obra Garden', deliveryDate: '2026-11-28', items: [], deliveryMethod,
});
vi.mock('../../services/orderService', () => ({ orderService: { listOrders: vi.fn(async () => [
    pedido('1', 'Em Trânsito', 'org1'),               // CIF a caminho: recebe (regra nova)
    pedido('2', 'Recebido', 'org1'),                  // conferido: sem "Editar Checkout"
    pedido('3', 'Em Trânsito', 'org1', FOB),          // FOB ainda não retirado: não recebe
    pedido('4', 'Entregue', 'org2'),                  // outra org: fora com org1 no topo
]) } }));

import SupplyChainReceiptManager from '../../components/SupplyChainReceiptManager';

describe('Recebimento no computador — regra única', () => {
    it('recorta pelo topo e oferece "Conferir e receber" só onde a regra deixa', async () => {
        render(<SupplyChainReceiptManager onViewOrder={() => {}} />);
        expect(await screen.findByText(/PC-1/)).toBeTruthy();
        expect(screen.getByText(/PC-2/)).toBeTruthy();
        expect(screen.getByText(/PC-3/)).toBeTruthy();
        expect(screen.queryByText(/PC-4/)).toBeNull();
        // Um só botão de conferir: o do CIF "Em Trânsito".
        expect(screen.getAllByTitle('Conferir e receber')).toHaveLength(1);
        expect(screen.queryByTitle('Editar Checkout')).toBeNull();
        expect(screen.queryByTitle('Fazer Checkout')).toBeNull();
    });
});
