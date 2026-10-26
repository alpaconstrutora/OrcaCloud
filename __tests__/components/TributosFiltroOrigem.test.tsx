// @vitest-environment jsdom
/**
 * Filtro de Origem em Tributos a Pagar (22/10/2026).
 * Plano: docs/planos/2026-10-22-tributos-filtro-de-origem.md
 *
 * Folha e pró-labore entraram em Tributos em 21–22/10 e a lista passou a misturar
 * quatro fontes. A coluna "Origem" mostrava a CATEGORIA contábil; agora mostra a
 * fonte (Folha, Pró-labore, Comercial, Manual) e a categoria virou a coluna
 * "Categoria". O filtro é de múltipla escolha e recorta KPIs, tabela e seleção.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ viewFocus: null, setViewFocus: () => {}, navigateToFocus: vi.fn() }),
}));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));

const base = { organization_id: 'org1', transaction_date: '2026-06-01', due_date: '2026-07-20', amount: 100, status: 'PENDING', business_status: 'PREVISTO', effective_status: 'VENCIDO', empreendimento_name: null, client_name: null };
vi.mock('../../services/taxPayableService', () => ({
    taxPayableService: {
        list: vi.fn(async () => [
            { ...base, id: 'f', source_system: 'LABOR', reference_id: 'labor-1-unallocated-fgts', description: 'FGTS folha', party_name: 'FGTS', category: 'Encargos Patronais' },
            { ...base, id: 'p', source_system: 'PROLABORE', reference_id: 'prolabore-2-inss', description: 'INSS prolabore', party_name: 'INSS (pró-labore)', category: 'Pró-labore' },
            { ...base, id: 'c', source_system: 'COMMERCIAL', reference_id: 'tax-3-p1-iss', description: 'ISS venda', party_name: 'ISS', category: 'Venda de Ativo' },
            { ...base, id: 'm', source_system: 'COMMERCIAL', reference_id: null, description: 'PIS manual', party_name: 'PIS', category: 'Manual' },
        ]),
        getRecognitionRegime: vi.fn(async () => 'CAIXA'),
        updateStatus: vi.fn(),
    },
}));
vi.mock('../../services/taxSettingsService', () => ({ taxSettingsService: { list: vi.fn(async () => []) } }));

import TributosAPagarManager from '../../components/TributosAPagarManager';

const linha = (texto: string) => screen.getByText(texto).closest('tr')!;
const visivel = (texto: string) => screen.queryByText(texto) !== null;

describe('Tributos a Pagar — filtro de Origem', () => {
    beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });

    it('a coluna Origem mostra a fonte; a categoria contábil fica na coluna Categoria', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('FGTS folha');

        expect(within(linha('FGTS folha')).getByText('Folha')).toBeTruthy();
        expect(within(linha('FGTS folha')).getByText('Encargos Patronais')).toBeTruthy();
        // Pró-labore e Manual têm o MESMO texto na fonte e na categoria: aparece nas duas colunas.
        expect(within(linha('INSS prolabore')).getAllByText('Pró-labore')).toHaveLength(2);
        expect(within(linha('ISS venda')).getByText('Comercial')).toBeTruthy();
        expect(within(linha('ISS venda')).getByText('Venda de Ativo')).toBeTruthy();
        expect(within(linha('PIS manual')).getAllByText('Manual')).toHaveLength(2);
        expect(screen.getAllByText('Categoria').length).toBeGreaterThan(0);
    });

    it('desmarcar origens esconde as linhas delas e o gatilho mostra o recorte', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('FGTS folha');

        fireEvent.click(screen.getByRole('button', { name: /^Origem/ }));
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Comercial/ }));
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Manual/ }));

        expect(visivel('FGTS folha')).toBe(true);
        expect(visivel('INSS prolabore')).toBe(true);
        expect(visivel('ISS venda')).toBe(false);
        expect(visivel('PIS manual')).toBe(false);
    });

    it('o recorte vale para os KPIs: "tributos em aberto" conta só o que está visível', async () => {
        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('FGTS folha');
        expect(screen.getByText('4 tributos em aberto')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /^Origem/ }));
        for (const nome of [/Pró-labore/, /Comercial/, /Manual/]) fireEvent.click(screen.getByRole('menuitemcheckbox', { name: nome }));
        expect(screen.getByText('1 tributos em aberto')).toBeTruthy();
    });

    it('a escolha sobrevive a recarregar a tela (usePersistedState)', async () => {
        const { unmount } = render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('FGTS folha');
        fireEvent.click(screen.getByRole('button', { name: /^Origem/ }));
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Comercial/ }));
        unmount();

        render(<TributosAPagarManager organizationId="org1" />);
        await screen.findByText('FGTS folha');
        expect(visivel('ISS venda')).toBe(false);
        expect(visivel('PIS manual')).toBe(true);
    });
});
