import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Configurações › Marcas e Modelos — docs/planos/2026-10-13-marcas-e-modelos.md
 *
 * O que trava:
 *   1. REGRA #5: com o topo em "Todas", criar marca passa por
 *      resolveWriteOrg('all-allowed') e replica em cada organização;
 *   2. a coluna Organização só aparece em "Todas";
 *   3. criar MODELO não pergunta organização — herda a da marca escolhida;
 *   4. excluir passa por useConfirm, e marca em uso não se exclui (botão
 *      desligado dizendo por quê).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ORGS = [{ id: 'org-a', name: 'Alpa' }, { id: 'org-b', name: 'Beta' }];
let orgIdDoTopo: string | null = null;
const resolveWriteOrg = vi.fn(async () => ({ kind: 'all' as const, orgIds: ['org-a', 'org-b'] }));

vi.mock('../../hooks/useOrgContext', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../hooks/useOrgContext')>();
    return {
        ...mod,
        useOrgContext: () => ({ orgId: orgIdDoTopo, companyId: null, source: orgIdDoTopo ? 'organization' : 'all' }),
        useWritableOrganizations: () => ORGS,
        useOrgWriteTarget: () => ({ resolveWriteOrg, orgTargetModal: null }),
    };
});
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: { organizations: typeof ORGS }) => unknown) => sel({ organizations: ORGS }),
}));

const svc = {
    listBrands: vi.fn(), listModels: vi.fn(), usage: vi.fn(),
    createBrand: vi.fn(), updateBrand: vi.fn(), deleteBrand: vi.fn(),
    createModel: vi.fn(), updateModel: vi.fn(), deleteModel: vi.fn(),
};
vi.mock('../../services/brandModelService', () => ({
    brandModelService: new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => (svc as Record<string, (...x: unknown[]) => unknown>)[k](...a) }),
}));

import BrandsSettings from '../../components/settings/BrandsSettings';
import ProductModelsSettings from '../../components/settings/ProductModelsSettings';
import { ConfirmProvider } from '../../components/ui/confirm';

const marca = (id: string, org: string, name: string) => ({ id, organization_id: org, name, is_active: true, created_at: '', updated_at: '' });
const MARCAS = [marca('b1', 'org-a', 'WEG'), marca('b2', 'org-b', 'Daikin')];

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    orgIdDoTopo = null;
    svc.listBrands.mockResolvedValue(MARCAS);
    svc.listModels.mockResolvedValue([]);
    svc.usage.mockResolvedValue({
        brands: new Map([['b1', { models: 0, assets: 2, stockItems: 0 }]]),
        models: new Map(),
    });
    svc.createBrand.mockImplementation(async (org: string, name: string) => marca(`novo-${org}`, org, name));
    svc.deleteBrand.mockResolvedValue(undefined);
});

describe('Configurações › Marcas', () => {
    it('em "Todas": lê sem filtro de org e mostra a coluna Organização', async () => {
        render(<ConfirmProvider><BrandsSettings /></ConfirmProvider>);
        expect(await screen.findByText('WEG')).toBeInTheDocument();
        expect(svc.listBrands).toHaveBeenCalledWith(null);
        expect(screen.getByRole('columnheader', { name: /Organização/ })).toBeInTheDocument();
        expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('com org no topo, a coluna Organização some', async () => {
        orgIdDoTopo = 'org-a';
        svc.listBrands.mockResolvedValue([MARCAS[0]]);
        render(<ConfirmProvider><BrandsSettings /></ConfirmProvider>);
        expect(await screen.findByText('WEG')).toBeInTheDocument();
        expect(svc.listBrands).toHaveBeenCalledWith('org-a');
        expect(screen.queryByRole('columnheader', { name: /Organização/ })).not.toBeInTheDocument();
    });

    it('criar em "Todas" passa por resolveWriteOrg("all-allowed") e cria nas duas organizações', async () => {
        render(<ConfirmProvider><BrandsSettings /></ConfirmProvider>);
        await screen.findByText('WEG');
        await userEvent.click(screen.getByRole('button', { name: /Nova marca/ }));
        await userEvent.type(screen.getByLabelText('Nome da marca'), 'Schneider');
        await userEvent.click(screen.getByRole('button', { name: 'Criar marca' }));
        await waitFor(() => expect(svc.createBrand).toHaveBeenCalledTimes(2));
        expect(resolveWriteOrg).toHaveBeenCalledWith('all-allowed');
        expect(svc.createBrand).toHaveBeenCalledWith('org-a', 'Schneider');
        expect(svc.createBrand).toHaveBeenCalledWith('org-b', 'Schneider');
        expect(await screen.findByText(/criada em 2 organizações/)).toBeInTheDocument();
    });

    it('marca em uso não se exclui — botão desligado com o motivo; marca sem uso pede confirmação', async () => {
        render(<ConfirmProvider><BrandsSettings /></ConfirmProvider>);
        const linhaWeg = (await screen.findByText('WEG')).closest('tr')!;
        const excluirWeg = within(linhaWeg).getByTitle('Excluir');
        expect(excluirWeg).toBeDisabled();
        expect(excluirWeg.parentElement).toHaveAttribute('title', expect.stringMatching(/Em uso por 2 ativos/));

        const linhaDaikin = screen.getByText('Daikin').closest('tr')!;
        await userEvent.click(within(linhaDaikin).getByTitle('Excluir'));
        expect(await screen.findByText('Excluir marca?')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Excluir marca' }));
        await waitFor(() => expect(svc.deleteBrand).toHaveBeenCalledWith('b2'));
    });
});

describe('Configurações › Modelos', () => {
    it('criar modelo NÃO pergunta organização — usa a da marca escolhida', async () => {
        svc.createModel.mockImplementation(async (org: string, input: Record<string, unknown>) => ({
            id: 'm-novo', organization_id: org, item_type: 'equipamento', manufacturer_code: null, default_asset_category: null,
            default_useful_life_months: null, technical_spec: null, datasheet_url: null, is_active: true, created_at: '', updated_at: '', ...input,
        }));
        render(<ConfirmProvider><ProductModelsSettings /></ConfirmProvider>);
        await waitFor(() => expect(svc.listBrands).toHaveBeenCalled());
        await userEvent.click(await screen.findByRole('button', { name: /Novo modelo/ }));

        await userEvent.selectOptions(screen.getByLabelText('Marca'), 'b2');
        await userEvent.type(screen.getByLabelText('Modelo'), 'FTXS-12');
        await userEvent.type(screen.getByLabelText('Vida útil (meses)'), '96');
        await userEvent.click(screen.getByRole('button', { name: 'Criar modelo' }));

        await waitFor(() => expect(svc.createModel).toHaveBeenCalled());
        expect(resolveWriteOrg).not.toHaveBeenCalled();
        expect(svc.createModel).toHaveBeenCalledWith('org-b', expect.objectContaining({
            brand_id: 'b2', name: 'FTXS-12', default_useful_life_months: 96,
        }));
    });

    it('botão de criar desligado diz por quê enquanto falta a marca', async () => {
        render(<ConfirmProvider><ProductModelsSettings /></ConfirmProvider>);
        await userEvent.click(await screen.findByRole('button', { name: /Novo modelo/ }));
        expect(screen.getByRole('button', { name: 'Criar modelo' })).toHaveAttribute('title', 'Escolha a marca');
    });
});
