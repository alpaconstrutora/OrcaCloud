// @vitest-environment jsdom
/**
 * Listas da oportunidade (portal e gestor) só com números da VERSÃO do Imovib (plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 2). Antes (16/11/2026) a
 * oportunidade sem versão mostrava os números digitados; agora mostra "—", e o formulário não tem
 * mais campo financeiro (só o ticket mínimo, regra comercial).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../services/imovibService', () => ({
    imovibService: { getStudies: () => Promise.resolve([]), listarVersoes: () => Promise.resolve([]) },
}));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: {
        listInterests: () => Promise.resolve([]),
        lidoDoEstudo: () => Promise.resolve({ local: { cidade: 'Campinas', uf: 'SP', obra_id: 'o1' }, parecer: 'aprovar', empreendimento: '011 - Garden Cambuhy' }),
    },
}));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOpportunities from '../../components/investor/portal/PortalOpportunities';
import OpportunitiesTab from '../../components/investor/OpportunitiesTab';

const GARDEN = { vgv: 11648000, tirAnual: 19.000997240878604, lucroLiquido: 2377356.900154821, exposicaoMaxima: 6059583.317888486, semExposicao: false };
const comVersao = {
    id: 'op1', organization_id: 'spe', title: 'Garden Cambuhy', status: 'estudo', is_published: true,
    imovib_study_id: 'e1', imovib_version_id: 'v1', ticket_min: 50000,
    indicadores_da_versao: GARDEN, resultados_da_versao: { duracao: 48, custoObra: 7_000_000, terreno: 1_500_000 },
    local: { cidade: 'Campinas', uf: 'SP', obra_id: 'o1' },
} as never;
// Linha antiga com números digitados: não aparecem mais.
const semVersao = { id: 'op2', organization_id: 'alpa', title: 'Quintino', status: 'captacao', is_published: true, vgv: 2000000, roi_pct: 12, tir_pct: 15 } as never;

describe('portal: só os números da versão', () => {
    it('com versão: VGV, ROI, TIR e local da versão/empreendimento; sem versão: "—" (nada digitado)', () => {
        render(<PortalOpportunities opportunities={[comVersao, semVersao]} portalToken="tok" />);
        const garden = screen.getByText('Garden Cambuhy').closest('tr')!;
        expect(within(garden).getByText(/R\$\s?11\.648\.000/)).toBeTruthy();
        expect(within(garden).getByText('39,2%')).toBeTruthy();
        expect(within(garden).getByText('19%')).toBeTruthy();
        expect(within(garden).getByText(/R\$\s?50\.000/)).toBeTruthy(); // ticket mínimo: regra comercial
        expect(within(garden).getByText('Campinas/SP')).toBeTruthy();
        const quintino = screen.getByText('Quintino').closest('tr')!;
        expect(within(quintino).queryByText(/R\$\s?2\.000\.000/)).toBeNull();
        expect(within(quintino).queryByText('12%')).toBeNull();
    });

    it('linha aberta: custo (obra + terreno) e prazo da versão', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[comVersao]} portalToken="tok" />);
        await user.click(screen.getByText('Garden Cambuhy'));
        expect(screen.getByText(/R\$\s?8\.500\.000/)).toBeTruthy();
        expect(screen.getByText('48 meses')).toBeTruthy();
    });
});

describe('gestor: lista com a versão; formulário sem números digitados', () => {
    const montar = () => render(
        <OpportunitiesTab opportunities={[comVersao]} isAdmin viewMode="list" organizationId="spe"
            onViewModeChange={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} openConfirm={vi.fn()} />,
    );

    it('a lista mostra VGV/ROI/TIR da versão', () => {
        montar();
        expect(screen.getAllByText('39.2%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('19.0%').length).toBeGreaterThan(0);
    });

    it('"Editar" não tem VGV/ROI/TIR/custo para digitar e mostra o que vem do estudo', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(screen.getAllByTitle('Editar')[0]);
        expect(await screen.findByText('011 - Garden Cambuhy')).toBeTruthy();
        expect(screen.getAllByText('Campinas, SP').length).toBeGreaterThan(0);
        for (const rotulo of ['VGV (R$)', 'ROI estimado (%)', 'TIR estimada (%)', 'Custo estimado (R$)', 'Área do terreno (m²)', 'Duração prevista (meses)']) {
            expect(screen.queryByText(rotulo)).toBeNull();
        }
        expect(screen.getByLabelText('Ticket mínimo (R$)')).toBeTruthy();
    });
});
