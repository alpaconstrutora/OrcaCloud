// @vitest-environment jsdom
/**
 * Conferência de 16/11 (Fase 7 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md):
 * pelo LINK, a aba Oportunidades era uma lista que só expandia — o painel de viabilidade, o PDF e o
 * Data Room moravam no detalhe que só o app interno abria. Agora a linha expandida tem
 * "Ver viabilidade" (com estudo) e "Documentos", que abrem o detalhe abaixo da lista.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ versao: vi.fn(), docs: vi.fn() }));
vi.mock('../../services/investorPortalTokenService', () => ({
    investorPortalTokenService: { getVersaoPublicadaByToken: svc.versao, submitInterestByToken: vi.fn(), getObraDaOportunidadeByToken: () => Promise.resolve(null) },
}));
vi.mock('../../services/opportunityDocumentsService', async (orig) => ({
    ...(await orig<typeof import('../../services/opportunityDocumentsService')>()),
    opportunityDocumentsService: { listByToken: svc.docs, getSignedUrlByToken: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import PortalOpportunities from '../../components/investor/portal/PortalOpportunities';
import { baseStudy } from '../fixtures/imovibEstudos';

const comEstudo = { id: 'op1', organization_id: 'spe', title: 'Garden — conferência', status: 'viabilidade', is_published: true, imovib_study_id: 'e1', imovib_version_id: 'v1' } as never;
const semEstudo = { id: 'op2', organization_id: 'alpa', title: 'Quintino', status: 'estudo', is_published: true } as never;
const vp = {
    study: baseStudy() as never, cenarios: [], relatorio: {}, calculo: null,
    versao: { id: 'v1', label: 'Conferência do portal', created_at: '2026-11-16T03:00:00Z' },
    organizacao: { name: 'SPE', logo_url: null },
};

beforeEach(() => {
    svc.versao.mockReset(); svc.docs.mockReset();
    svc.versao.mockResolvedValue(vp);
    svc.docs.mockResolvedValue([{ id: 'd1', name: 'Relatório.pdf', file_path: 'x', category: 'evte', mime_type: 'application/pdf' }]);
});

describe('oportunidade pelo link: viabilidade e documentos', () => {
    it('"Ver viabilidade" abre o painel da versão publicada, pela oportunidade', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[comEstudo, semEstudo]} portalToken="tok" />);
        await user.click(screen.getByText('Garden — conferência'));
        await user.click(screen.getByRole('button', { name: 'Ver viabilidade' }));
        const detalhe = await screen.findByRole('region', { name: 'Garden — conferência' });
        expect(await within(detalhe).findByText('Versão Conferência do portal · congelada em 16/11/2026')).toBeTruthy();
        expect(svc.versao).toHaveBeenCalledWith('tok', 'op1');
    });

    it('"Documentos" abre o Data Room da oportunidade pelo token', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[comEstudo]} portalToken="tok" />);
        await user.click(screen.getByText('Garden — conferência'));
        await user.click(screen.getByRole('button', { name: 'Documentos' }));
        expect(await screen.findByText('Relatório.pdf')).toBeTruthy();
        expect(svc.docs).toHaveBeenCalledWith('tok', 'op1');
    });

    it('sem estudo do Imovib: só "Documentos"', async () => {
        const user = userEvent.setup();
        render(<PortalOpportunities opportunities={[semEstudo]} portalToken="tok" />);
        await user.click(screen.getByText('Quintino'));
        expect(screen.queryByRole('button', { name: 'Ver viabilidade' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Documentos' })).toBeTruthy();
    });

    it('versão ainda não publicada: diz o motivo', async () => {
        const user = userEvent.setup();
        svc.versao.mockRejectedValue(new Error('Esta oportunidade ainda não tem uma versão do estudo publicada.'));
        render(<PortalOpportunities opportunities={[comEstudo]} portalToken="tok" />);
        await user.click(screen.getByText('Garden — conferência'));
        await user.click(screen.getByRole('button', { name: 'Ver viabilidade' }));
        expect(await screen.findByText('Esta oportunidade ainda não tem uma versão do estudo publicada.')).toBeTruthy();
    });
});
