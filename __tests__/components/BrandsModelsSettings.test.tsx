import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Configurações › Marcas e Modelos — docs/planos/2026-10-13-marcas-e-modelos.md
 *
 * UMA tela (pedido de 13/10: "modelo deve ser fundido com marca"): o modelo é
 * cadastrado dentro do painel da marca. O que trava:
 *   1. REGRA #5: em "Todas", criar marca passa por resolveWriteOrg('all-allowed')
 *      e replica em cada organização; a coluna Organização só aparece em "Todas";
 *   2. criar MODELO não pergunta organização — usa a da marca aberta, e volta ao
 *      painel da marca com o modelo na lista (sem segundo drawer);
 *   3. marca criada numa org só vira a edição dela, pronta para os modelos;
 *   4. marca com modelo ou em uso não se exclui (botão desligado dizendo por quê);
 *      sem uso, pede confirmação.
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
import { ConfirmProvider } from '../../components/ui/confirm';

const marca = (id: string, org: string, name: string) => ({ id, organization_id: org, name, is_active: true, created_at: '', updated_at: '' });
const modelo = (id: string, brand: string, org: string, name: string) => ({
    id, brand_id: brand, organization_id: org, name, item_type: 'equipamento', manufacturer_code: null, default_asset_category: null,
    default_useful_life_months: null, technical_spec: null, datasheet_url: null, is_active: true, created_at: '', updated_at: '',
});
const MARCAS = [marca('b1', 'org-a', 'WEG'), marca('b2', 'org-b', 'Daikin'), marca('b3', 'org-a', 'Gree')];
const MODELOS = [modelo('m1', 'b3', 'org-a', 'GWC-12')];

const montar = () => render(<ConfirmProvider><BrandsSettings /></ConfirmProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    orgIdDoTopo = null;
    svc.listBrands.mockResolvedValue(MARCAS);
    svc.listModels.mockResolvedValue(MODELOS);
    svc.usage.mockResolvedValue({
        brands: new Map([['b1', { models: 0, assets: 2, stockItems: 0 }]]),
        models: new Map(),
    });
    svc.createBrand.mockImplementation(async (org: string, name: string) => marca(`novo-${org}`, org, name));
    svc.deleteBrand.mockResolvedValue(undefined);
    svc.createModel.mockImplementation(async (org: string, input: Record<string, unknown>) => ({ ...modelo('m-novo', '', org, ''), ...input }));
});

describe('Configurações › Marcas e Modelos — lista', () => {
    it('em "Todas": lê sem filtro de org, mostra a coluna Organização e a contagem de modelos', async () => {
        montar();
        const linhaGree = (await screen.findByText('Gree')).closest('tr')!;
        expect(svc.listBrands).toHaveBeenCalledWith(null);
        expect(svc.listModels).toHaveBeenCalledWith(null);
        expect(screen.getByRole('columnheader', { name: /Organização/ })).toBeInTheDocument();
        expect(within(linhaGree).getByText('1')).toBeInTheDocument();
    });

    it('com org no topo, a coluna Organização some', async () => {
        orgIdDoTopo = 'org-a';
        montar();
        await screen.findByText('WEG');
        expect(svc.listBrands).toHaveBeenCalledWith('org-a');
        expect(screen.queryByRole('columnheader', { name: /Organização/ })).not.toBeInTheDocument();
    });

    it('não existe mais uma lista de modelos separada: só a coluna/contagem dentro da lista de marcas', async () => {
        montar();
        await screen.findByText('WEG');
        expect(screen.queryByRole('columnheader', { name: /Código do fabricante/ })).not.toBeInTheDocument();
    });

    it('criar em "Todas" passa por resolveWriteOrg("all-allowed") e cria nas duas organizações', async () => {
        montar();
        await screen.findByText('WEG');
        await userEvent.click(screen.getByRole('button', { name: /Nova marca/ }));
        expect(screen.getByText(/Crie a marca primeiro/)).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Nome da marca'), 'Schneider');
        await userEvent.click(screen.getByRole('button', { name: 'Criar marca' }));
        await waitFor(() => expect(svc.createBrand).toHaveBeenCalledTimes(2));
        expect(resolveWriteOrg).toHaveBeenCalledWith('all-allowed');
        expect(svc.createBrand).toHaveBeenCalledWith('org-a', 'Schneider');
        expect(svc.createBrand).toHaveBeenCalledWith('org-b', 'Schneider');
        expect(await screen.findByText(/criada em 2 organizações/)).toBeInTheDocument();
    });

    it('marca criada numa org só vira a edição dela, já com "Novo modelo"', async () => {
        resolveWriteOrg.mockResolvedValueOnce({ kind: 'org', orgId: 'org-a' } as never);
        montar();
        await screen.findByText('WEG');
        await userEvent.click(screen.getByRole('button', { name: /Nova marca/ }));
        await userEvent.type(screen.getByLabelText('Nome da marca'), 'Midea');
        await userEvent.click(screen.getByRole('button', { name: 'Criar marca' }));
        expect(await screen.findByText('Editar marca')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Novo modelo/ })).toBeInTheDocument();
        expect(screen.getByText(/cadastre os modelos abaixo/)).toBeInTheDocument();
    });

    it('marca com modelo ou em uso não se exclui — botão desligado com o motivo; sem uso pede confirmação', async () => {
        montar();
        const linhaWeg = (await screen.findByText('WEG')).closest('tr')!;
        const excluirWeg = within(linhaWeg).getByTitle('Excluir');
        expect(excluirWeg).toBeDisabled();
        expect(excluirWeg.parentElement).toHaveAttribute('title', expect.stringMatching(/Em uso por 2 ativos/));

        const linhaGree = screen.getByText('Gree').closest('tr')!;
        expect(within(linhaGree).getByTitle('Excluir').parentElement).toHaveAttribute('title', expect.stringMatching(/Tem 1 modelo/));

        const linhaDaikin = screen.getByText('Daikin').closest('tr')!;
        await userEvent.click(within(linhaDaikin).getByTitle('Excluir'));
        expect(await screen.findByText('Excluir marca?')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Excluir marca' }));
        await waitFor(() => expect(svc.deleteBrand).toHaveBeenCalledWith('b2'));
    });
});

describe('Configurações › Marcas e Modelos — modelo dentro da marca', () => {
    it('o painel da marca lista os modelos dela', async () => {
        montar();
        await userEvent.click(await screen.findByText('Gree'));
        expect(await screen.findByText('Modelos (1)')).toBeInTheDocument();
        expect(screen.getByText('GWC-12')).toBeInTheDocument();
    });

    it('criar modelo NÃO pergunta organização — usa a da marca — e volta ao painel da marca com ele na lista', async () => {
        montar();
        await userEvent.click(await screen.findByText('Daikin'));
        await userEvent.click(await screen.findByRole('button', { name: /Novo modelo/ }));
        expect(screen.getByText('Novo modelo', { selector: 'h2' })).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Modelo'), 'FTXS-12');
        await userEvent.type(screen.getByLabelText('Vida útil (meses)'), '96');
        await userEvent.click(screen.getByRole('button', { name: 'Criar modelo' }));

        await waitFor(() => expect(svc.createModel).toHaveBeenCalled());
        expect(resolveWriteOrg).not.toHaveBeenCalled();
        expect(svc.createModel).toHaveBeenCalledWith('org-b', expect.objectContaining({
            brand_id: 'b2', name: 'FTXS-12', default_useful_life_months: 96,
        }));
        expect(await screen.findByText('Modelos (1)')).toBeInTheDocument();
        expect(screen.getByText('FTXS-12')).toBeInTheDocument();
        // o aviso aparece no rodapé do painel (o toast do canto cobriria os botões)
        expect(screen.getByRole('status')).toHaveTextContent('Modelo FTXS-12 criado.');
    });

    it('botão de criar modelo desligado diz por quê enquanto falta o nome', async () => {
        montar();
        await userEvent.click(await screen.findByText('Daikin'));
        await userEvent.click(await screen.findByRole('button', { name: /Novo modelo/ }));
        expect(screen.getByRole('button', { name: 'Criar modelo' })).toHaveAttribute('title', 'Informe o nome do modelo');
    });

    it('voltar com o modelo alterado pede confirmação', async () => {
        montar();
        await userEvent.click(await screen.findByText('Daikin'));
        await userEvent.click(await screen.findByRole('button', { name: /Novo modelo/ }));
        await userEvent.type(screen.getByLabelText('Modelo'), 'X');
        await userEvent.click(screen.getByRole('button', { name: 'Voltar para a marca' }));
        expect(await screen.findByText('Sair sem salvar?')).toBeInTheDocument();
    });
});
