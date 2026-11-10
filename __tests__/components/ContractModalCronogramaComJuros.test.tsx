// @vitest-environment jsdom
/**
 * Contrato de venda com juros Price/SAC (plano docs/planos/2026-11-10-juros-parcelamento-pendencias.md,
 * item 4): os campos do gerador e o "Redistribuir igualmente" regeram parcelas IGUAIS e SEM juros.
 * Com juros no cronograma eles ficam travados, com o motivo na tela (botão desligado diz por quê).
 * Mocks: os mesmos de ContractModalParcelasSoNaAba.test.tsx.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// `vi.mock` é içado para o topo do arquivo: nada de variável de módulo dentro
// da fábrica — daí cada uma declarar seu próprio `() => Promise.resolve([])`.
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: () => Promise.resolve([]) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: () => Promise.resolve([]),
        listPlanoContas: () => Promise.resolve([]),
        listChartOfAccounts: () => Promise.resolve([]),
        listPaymentAccounts: () => Promise.resolve([]),
    },
}));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: () => Promise.resolve([]) } }));
vi.mock('../../services/storageService', () => ({ storageService: { upload: vi.fn() } }));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: () => Promise.resolve([]) } }));
vi.mock('../../services/contractTypeService', () => ({ contractTypeService: { listTypes: () => Promise.resolve([]) } }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { list: () => Promise.resolve([]) } }));
vi.mock('../../services/documentNumbering', () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue('001'),
    MissingCodeError: class extends Error {},
    DocType: {},
}));
vi.mock('../../services/contractNumberRegenService', () => ({
    getNumberLockReason: () => Promise.resolve(null),
    regenerateContractNumber: vi.fn(),
}));
vi.mock('../../lib/supabase', () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain; chain.order = () => chain;
    chain.limit = () => chain; chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
    return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: vi.fn() } } };
});

import { ContractModal } from '../../components/ContractModal';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';
import type { Contract, ContractInstallment } from '../../types';

/** Venda Price 1% a.m.: 2 parcelas de 8.884,88 com juros/principal (vindas do "Montar plano"). */
const comJuros: ContractInstallment[] = [
    { date: '2026-12-10', value: 8884.88, interest: 1000, principal: 7884.88, installment_type: 'MENSAL' },
    { date: '2027-01-10', value: 8884.88, interest: 921.15, principal: 7963.73, installment_type: 'MENSAL' },
];
const semJuros: ContractInstallment[] = [
    { date: '2026-12-10', value: 8884.88, installment_type: 'MENSAL' },
    { date: '2027-01-10', value: 8884.88, installment_type: 'MENSAL' },
];

const montar = (cronograma: ContractInstallment[], onSubmit = vi.fn(async () => {})) => {
    useStore.setState({ organizations: [] as never, projects: [] as never } as never);
    render(
        <ConfirmProvider>
            <ContractModal
                isOpen
                initialData={{
                    id: 'ct-1', organization_id: 'org-1', title: 'Venda — Apto 101',
                    original_value: 17769.76, payment_term_type: 'Parcelado', payment_method: 'Boleto Bancário',
                    is_recurring: false, start_date: '2026-11-10', payment_installments: 2,
                    payment_schedule: cronograma,
                } as Contract}
                onClose={() => {}}
                onSubmit={onSubmit}
                projectId=""
                organizationId="org-1"
                domain="VENDAS"
            />
        </ConfirmProvider>,
    );
    return onSubmit;
};

describe('ContractModal — cronograma com juros (Price/SAC) não é regerado em silêncio', () => {
    beforeEach(() => vi.clearAllMocks());

    it('com juros: campos do gerador e "Redistribuir" travados, com o motivo escrito', () => {
        montar(comJuros);
        const nParcelas = screen.getByText('Nº de Parcelas').parentElement!.querySelector('input')!;
        expect(nParcelas.disabled).toBe(true);
        expect(nParcelas.title).toMatch(/Montar plano/);
        const redistribuir = screen.getByRole('button', { name: 'Redistribuir igualmente' }) as HTMLButtonElement;
        expect(redistribuir.disabled).toBe(true);
        expect(screen.getByText(/2 parcelas com juros \(R\$ 1\.921,15 de juros no total\)\. As parcelas têm juros/)).toBeTruthy();
    });

    it('sem juros: nada muda (campos livres)', () => {
        montar(semJuros);
        const nParcelas = screen.getByText('Nº de Parcelas').parentElement!.querySelector('input')!;
        expect(nParcelas.disabled).toBe(false);
        expect((screen.getByRole('button', { name: 'Redistribuir igualmente' }) as HTMLButtonElement).disabled).toBe(false);
    });
});
