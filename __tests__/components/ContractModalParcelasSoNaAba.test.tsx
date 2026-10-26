// @vitest-environment jsdom
/**
 * Suprimentos › Contratos › Financeiro (24/10/2026): as parcelas apareciam em
 * dois lugares — na tabela "Cronograma de Parcelas" de Dados Gerais › Condições
 * de Pagamento e na sub-aba Parcelas. O usuário escolheu a sub-aba Parcelas.
 *
 * O que este teste trava:
 *  1. embutido (Dados Gerais) não mostra a tabela; os campos que montam o plano
 *     (Entrada, Nº de Parcelas, Periodicidade, 1º vencimento) continuam;
 *  2. o aviso de soma divergente sobrevive sem a tabela — mudar o Valor Original
 *     não regera o cronograma sozinho. Desde 26/10/2026 ele compara com o Valor
 *     ATUAL (original + aditivos) e aponta para Financeiro › Parcelas › "Corrigir
 *     divergência": o "Redistribuir igualmente" daqui regerava tudo pelo total,
 *     ignorava parcela paga e desfazia em silêncio a correção feita lá
 *     (plano 2026-10-26-contrato-parcelas-conferencia-e-gerador, revisão);
 *  3. a gaveta (contrato novo, sem sub-aba Parcelas ainda) segue com a tabela.
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
import type { Contract } from '../../types';

/** Contrato parcelado de R$ 3.000 em 3× mensais; `valores` troca o cronograma salvo. */
const contrato = (valores = [1000, 1000, 1000]): Partial<Contract> => ({
    id: 'ct-1',
    organization_id: 'org-1',
    title: 'Empreitada',
    original_value: 3000,
    payment_term_type: 'Parcelado',
    payment_method: 'Boleto Bancário',
    is_recurring: false,
    start_date: '2026-11-01',
    payment_installments: valores.length,
    payment_schedule: valores.map((value, i) => ({
        date: `2026-${String(11 + i).padStart(2, '0')}-10`.replace('2026-13', '2027-01'),
        value,
        installment_type: 'MENSAL',
    })),
});

const montar = (opts: { inline: boolean; valores?: number[] }) => {
    useStore.setState({ organizations: [] as never, projects: [] as never } as never);
    render(
        <ConfirmProvider>
            <ContractModal
                isOpen
                {...(opts.inline ? { variant: 'inline' as const, sections: ['pagamento' as const] } : {})}
                initialData={contrato(opts.valores) as Contract}
                onClose={() => {}}
                onSubmit={async () => {}}
                projectId=""
                organizationId="org-1"
                domain="SUPRIMENTOS"
            />
        </ConfirmProvider>,
    );
};

describe('ContractModal — parcelas só na sub-aba Parcelas', () => {
    beforeEach(() => vi.clearAllMocks());

    it('Dados Gerais (embutido): sem a tabela, com os campos do plano', () => {
        montar({ inline: true });

        expect(screen.queryByText('Cronograma de Parcelas')).toBeNull();
        expect(screen.getByText('Nº de Parcelas')).toBeTruthy();
        expect(screen.getByText('1º Vencimento das Parcelas')).toBeTruthy();
        expect(screen.queryByText(/difere do valor do contrato/)).toBeNull();
    });

    it('Dados Gerais (embutido): soma divergente avisa e aponta a correção em Parcelas', () => {
        montar({ inline: true, valores: [1000, 1000, 500] });

        expect(screen.getByText(/Soma das parcelas \(R\$ 2\.500,00\) difere do valor do contrato \(R\$ 3\.000,00, com aditivos\)/)).toBeTruthy();
        expect(screen.getByText(/Corrija em Financeiro › Parcelas/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Redistribuir igualmente' })).toBeNull();
    });

    it('gaveta (contrato novo/edição pela lista): a tabela continua', () => {
        montar({ inline: false });
        expect(screen.getByText('Cronograma de Parcelas')).toBeTruthy();
    });
});
