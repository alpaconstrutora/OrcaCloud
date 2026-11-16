// @vitest-environment jsdom
/**
 * Pedido de 16/11/2026: o Tiago via VGV, ROI e TIR em "—" na lista do portal, mas a versão publicada
 * do Imovib tem esses números. Com versão, as listas (portal e gestor) mostram os da versão; o
 * "Editar" do gestor continua abrindo os campos digitados à mão.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../services/opportunityProjectService', () => ({ opportunityProjectService: { listForOrg: () => Promise.resolve([]) } }));
vi.mock('../../services/imovibService', () => ({
    imovibService: { getStudies: () => Promise.resolve([]), listarVersoes: () => Promise.resolve([]) },
}));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { listCompetitors: () => Promise.resolve([]), listInterests: () => Promise.resolve([]) },
}));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOpportunities from '../../components/investor/portal/PortalOpportunities';
import OpportunitiesTab from '../../components/investor/OpportunitiesTab';

const GARDEN = { vgv: 11648000, tirAnual: 19.000997240878604, lucroLiquido: 2377356.900154821, exposicaoMaxima: 6059583.317888486, semExposicao: false };
const comVersao = {
    id: 'op1', organization_id: 'spe', title: 'Garden Cambuhy', status: 'estudo', is_published: true,
    imovib_study_id: 'e1', imovib_version_id: 'v1', vgv: 1000, roi_pct: 1, tir_pct: 2, ticket_min: 50000,
    indicadores_da_versao: GARDEN,
} as never;
const semVersao = { id: 'op2', organization_id: 'alpa', title: 'Quintino', status: 'captacao', is_published: true, vgv: 2000000, roi_pct: 12, tir_pct: 15 } as never;

describe('portal: VGV, ROI e TIR da versão publicada', () => {
    it('com versão: os da versão; sem versão: os digitados', () => {
        render(<PortalOpportunities opportunities={[comVersao, semVersao]} portalToken="tok" />);
        const garden = screen.getByText('Garden Cambuhy').closest('tr')!;
        expect(within(garden).getByText(/R\$\s?11\.648\.000/)).toBeTruthy();
        expect(within(garden).getByText('39,2%')).toBeTruthy();
        expect(within(garden).getByText('19%')).toBeTruthy();
        expect(within(garden).getByText(/R\$\s?50\.000/)).toBeTruthy(); // ticket mínimo: o do formulário
        const quintino = screen.getByText('Quintino').closest('tr')!;
        expect(within(quintino).getByText(/R\$\s?2\.000\.000/)).toBeTruthy();
        expect(within(quintino).getByText('12%')).toBeTruthy();
    });
});

describe('gestor: lista com a versão, edição com os campos à mão', () => {
    const montar = () => render(
        <OpportunitiesTab opportunities={[comVersao]} isAdmin viewMode="list" organizationId="spe"
            onViewModeChange={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} openConfirm={vi.fn()} />,
    );

    it('a lista mostra VGV/ROI/TIR da versão', () => {
        montar();
        expect(screen.getAllByText('39.2%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('19.0%').length).toBeGreaterThan(0);
        expect(screen.queryByText('1.0%')).toBeNull(); // o ROI digitado (1) não aparece
    });

    it('"Editar" abre o formulário com o digitado, e avisa que o investidor vê a versão', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(screen.getAllByTitle('Editar')[0]);
        expect(await screen.findByText(/o investidor vê VGV, ROI e TIR da versão/)).toBeTruthy();
        const valores = screen.getAllByRole('textbox').map(i => (i as HTMLInputElement).value);
        expect(valores.some(v => /11[.,]?648/.test(v))).toBe(false);
        expect(valores.some(v => /^1[.,]000/.test(v) || v === '1000')).toBe(true);
    });
});
