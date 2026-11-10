// @vitest-environment jsdom
/**
 * Portal do Corretor › Empreendimentos, tabela do computador, no LOTE (10/11/2026):
 * "implementar no Portal do Corretor também" — a mesma troca da Tabela de Preços.
 * Plano: docs/planos/2026-11-10-tabela-precos-colunas-do-lote.md.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const loteDoPredio = vi.hoisted(() => vi.fn());

vi.mock('../../services/brokerPortalService', () => ({
    brokerPortalService: {
        getPriceColumnsByToken: vi.fn(async () => null),
        getPriceTableByToken: vi.fn(async () => ({
            table: { id: 't-1', version_label: 'v1', effective_date: '2026-11-10', status: 'active', activated_at: '' },
            items: [{
                id: 'i-1', price_table_id: 't-1', property_id: 'u-1', price: 80000, current_price: 80000, created_at: '',
                property_name: 'Lote Vale do Sol', property_status: 'AVAILABLE', private_area: 134,
                bedrooms: 2, parking_spaces: 1, bathrooms: 1, floor: 0, position_type: 'FRONT',
            }],
        })),
        getRentalPriceTableByToken: vi.fn(async () => ({ table: null, items: [] })),
        getLoteDoPredioByToken: loteDoPredio,
    },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import BrokerDevelopments from '../../components/broker/BrokerDevelopments';

const predio = { id: 'b-1', type: 'BUILDING', name: '021 - Lote Vale do Sol', status: 'AVAILABLE', organization_id: 'org-1' };
const lote = { id: 'u-1', type: 'LAND', name: 'Lote Vale do Sol', parent_id: 'b-1', status: 'AVAILABLE', price: 80000 };

const abrir = async () => {
    render(<BrokerDevelopments buildings={[predio] as never} units={[predio, lote] as never} portalToken="tok-1" onMakeProposal={() => {}} />);
    await userEvent.setup().click(await screen.findByText('021 - Lote Vale do Sol'));
    await screen.findByText('Lote Vale do Sol');
};
const cabecalhos = () => within(screen.getByRole('table')).getAllByRole('columnheader').map(th => th.textContent?.trim());

describe('BrokerDevelopments — LOTE', () => {
    it('no LOTE: Quadra e Nº do lote logo depois de Unidade; sem Dormitórios, Vagas, Banheiros, Pavimento, Posição', async () => {
        loteDoPredio.mockResolvedValue({ estrutura: 'LOTE', quadraLote: { 'u-1': { quadra: null, lote: '4B' } } });
        await abrir();
        expect(await screen.findByText('4B')).toBeInTheDocument();
        const h = cabecalhos();
        expect(h.indexOf('Quadra')).toBe(h.indexOf('Unidade') + 1);
        expect(h.indexOf('Nº do lote')).toBe(h.indexOf('Unidade') + 2);
        for (const fora of ['Dormitórios', 'Vagas', 'Banheiros', 'Pavimento', 'Posição']) expect(h).not.toContain(fora);
        expect(loteDoPredio).toHaveBeenCalledWith('tok-1', 'b-1');
    });

    it('prédio (TORRES): as colunas de sempre, sem Quadra nem Nº do lote', async () => {
        loteDoPredio.mockResolvedValue({ estrutura: 'TORRES', quadraLote: {} });
        await abrir();
        const h = cabecalhos();
        for (const col of ['Dormitórios', 'Vagas', 'Banheiros', 'Pavimento', 'Posição']) expect(h).toContain(col);
        expect(h).not.toContain('Quadra');
        expect(h).not.toContain('Nº do lote');
    });

    it('RPC indisponível (migration não aplicada): cai na tabela de sempre, sem quebrar', async () => {
        loteDoPredio.mockRejectedValue(new Error('function does not exist'));
        await abrir();
        expect(cabecalhos()).toContain('Dormitórios');
    });
});
