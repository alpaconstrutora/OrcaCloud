// @vitest-environment jsdom
/**
 * Aprovação Financeira › filtro "Origem" (16/11/2026 — "no filtro Origem falta
 * Tributos. Verifique se falta outras origens").
 *
 * O filtro só oferecia as origens com item na fila naquele momento. Sem DARF
 * pendente (e com o tributo solto fora da fila desde 09/11), "Tributo" sumia —
 * junto com Folha, Obra, NF-e, Planta, Ofício… Agora oferece o catálogo inteiro
 * (utils/filaAprovacao.ORIGENS_DA_FILA) e o DARF conta como Tributo.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const fila = vi.hoisted(() => ({ itens: [] as unknown[] }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../services/approvalService', () => ({
    approvalService: {
        listActionQueue: vi.fn(() => Promise.resolve(fila.itens)),
        getPendingSummary: vi.fn().mockResolvedValue([]),
    },
}));
vi.mock('../../services/alcadaDaBaixa', () => ({ idsPagosSemAlcada: vi.fn().mockResolvedValue(new Set()) }));
vi.mock('../../services/financialApprovalService', () => ({
    financialApprovalService: { listConfig: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/approvalApproversService', () => ({
    approvalApproversService: { listar: vi.fn().mockResolvedValue([]), membros: vi.fn().mockResolvedValue([]) },
}));

import FinancialApprovalModule from '../../components/FinancialApprovalModule';
import { ConfirmProvider } from '../../components/ui/confirm';

const item = (id: string, entity: string, origem: string, title: string) => ({
    entity, id, title, party_name: null, project_name: null, amount: 100, due_date: '2026-11-20',
    approval_status: 'PENDENTE', approval_chain: [], approval_required_levels: 1, origem,
    pode_aprovar: true, vez_de: [],
});

async function abrir() {
    render(<ConfirmProvider><FinancialApprovalModule organizationId="org-1" userEmail="u@alpa" /></ConfirmProvider>);
    const select = await screen.findByTitle('Origem do item');
    return select as HTMLSelectElement;
}
const opcoes = (s: HTMLSelectElement) => within(s).getAllByRole('option').map(o => o.textContent);

beforeEach(() => {
    localStorage.clear();
    fila.itens = [];
});

describe('Aprovação Financeira › filtro Origem', () => {
    it('fila SEM tributo: "Tributo" e as demais origens estão no filtro mesmo assim', async () => {
        fila.itens = [item('t1', 'transaction', 'COMMERCIAL', 'Comissão')];
        const s = await abrir();
        await waitFor(() => expect(opcoes(s)).toContain('Comercial'));
        for (const o of ['Tributo', 'Folha', 'Obra', 'NF-e', 'Planta', 'Ofício', 'Solicitação de compra', 'Manutenção de ativo']) {
            expect(opcoes(s)).toContain(o);
        }
        expect(opcoes(s)[0]).toBe('Todas as origens');
    });

    it('"Tributo" recorta DARF e FGTS avulso juntos', async () => {
        fila.itens = [
            item('d1', 'darf', 'DARF', 'DARF 10/2026 — IRRF'),
            item('f1', 'transaction', 'TRIBUTO', 'FGTS 10/2026'),
            item('b1', 'transaction', 'BOLETO', 'Energisa'),
        ];
        const s = await abrir();
        await screen.findByText('Energisa');
        fireEvent.change(s, { target: { value: 'Tributo' } });
        await waitFor(() => expect(screen.queryByText('Energisa')).toBeNull());
        expect(screen.getByText('DARF 10/2026 — IRRF')).toBeTruthy();
        expect(screen.getByText('FGTS 10/2026')).toBeTruthy();
    });
});
