// @vitest-environment jsdom
/**
 * Incorporação › Oportunidades no padrão do app (docs/ui_ux_guia_unificado.md). Pedido do usuário (25/11/2026):
 * "os dashcards, titulo, fonts alias tudo na tela não esta no padrao do app". Antes: título h3, cards à mão em
 * fundo escuro com caixa alta, abas e alternador feitos à mão, tabela sem ordenação com ROI/TIR numa célula só.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/investorService', () => ({ investorService: {} }));
vi.mock('../../services/speService', () => ({ speService: { list: () => Promise.resolve([]) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { listInterests: () => Promise.resolve([]) },
}));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import OpportunitiesTab from '../../components/investor/OpportunitiesTab';

const garden = {
    id: 'op1', organization_id: 'spe', title: 'Garden 01', status: 'viabilidade', is_published: true,
    imovib_study_id: 'e1', imovib_version_id: 'v1',
    indicadores_da_versao: { vgv: 11648000, tirAnual: 19, lucroLiquido: 2377356.9, exposicaoMaxima: 6059583.3, semExposicao: false },
    resultados_da_versao: { duracao: 36 }, local: { cidade: 'Cambuí', uf: 'MG' },
} as never;
const rascunho = { id: 'op2', organization_id: 'spe', title: 'Quintino', status: 'estudo', is_published: false } as never;

const Tela = (p: { isAdmin?: boolean; titulo?: string }) => (
    <OpportunitiesTab opportunities={[garden, rascunho]} isAdmin={p.isAdmin ?? true} titulo={p.titulo}
        onDelete={vi.fn()} onUpdate={vi.fn()} openConfirm={vi.fn()} />
);

beforeEach(() => localStorage.clear());

describe('Oportunidades no padrão do app', () => {
    it('título h1 + subtítulo, abas no TabsBar e os 4 indicadores do KpiCard', () => {
        render(<Tela titulo="Oportunidades" />);
        expect(screen.getByRole('heading', { level: 1, name: 'Oportunidades' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: /Oportunidades/ })).toBeTruthy();
        expect(screen.getByRole('tab', { name: /Interesses/ })).toBeTruthy();
        for (const rotulo of ['VGV das ativas', 'Oportunidades', 'Em captação', 'Rascunhos']) {
            expect(screen.getAllByText(rotulo).length).toBeGreaterThan(0);
        }
        expect(screen.getByText('1 publicada e não encerrada')).toBeTruthy();
        // Nada de caixa alta nem do card escuro de antes.
        expect(document.querySelector('.uppercase')).toBeNull();
        expect(document.querySelector('[class*="0B1727"]')).toBeNull();
    });

    it('tabela: ROI e TIR em colunas próprias, status em texto com "Rascunho", ações à vista', () => {
        render(<Tela titulo="Oportunidades" />);
        const tabela = screen.getByRole('table');
        expect(within(tabela).getByRole('columnheader', { name: /ROI/ })).toBeTruthy();
        expect(within(tabela).getByRole('columnheader', { name: /TIR/ })).toBeTruthy();
        const linha = within(tabela).getByText('Garden 01').closest('tr')!;
        expect(within(linha).getByText('39,2%')).toBeTruthy();
        expect(within(linha).getByText('19,0%')).toBeTruthy();
        expect(within(linha).getByRole('button', { name: 'Ver' })).toBeTruthy();
        expect(within(linha).getByRole('button', { name: 'Despublicar' })).toBeTruthy();
        expect(within(tabela).getByText(/Rascunho/)).toBeTruthy();
    });

    it('filtro de status recorta a lista; a grade mostra os mesmos cartões com as ações sempre visíveis', async () => {
        const user = userEvent.setup();
        render(<Tela titulo="Oportunidades" />);
        await user.click(screen.getByRole('button', { name: /^Status/ }));
        await user.click(screen.getByRole('menuitemradio', { name: /Estudo/ }));
        expect(screen.queryByText('Garden 01')).toBeNull();
        expect(screen.getByText('Quintino')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /^Status/ }));
        await user.click(screen.getByRole('menuitemradio', { name: /Todos/ }));
        await user.click(screen.getByTitle('Visualização em grade'));
        const cartao = screen.getByRole('article', { name: 'Garden 01' });
        expect(within(cartao).getByRole('button', { name: 'Ver' })).toBeTruthy();
        expect(within(cartao).getByText('R$ 11,6M')).toBeTruthy();
    });

    it('dentro do painel do investidor (sem título, só leitura): sem h1, sem abas, só as publicadas', () => {
        render(<Tela isAdmin={false} />);
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.queryByText('Quintino')).toBeNull();
        expect(screen.queryByRole('button', { name: /Nova oportunidade/i })).toBeNull();
    });
});
