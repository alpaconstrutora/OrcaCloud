// @vitest-environment jsdom
/**
 * Fase 2 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: a oportunidade
 * com estudo do Imovib publica uma VERSÃO congelada. Sem versão, publicar fica desligado e diz por quê.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getStudies: vi.fn(),
    listarVersoes: vi.fn(),
    listCompetitors: vi.fn(),
    listForOrg: vi.fn(),
}));
vi.mock('../../services/imovibService', () => ({ imovibService: { getStudies: svc.getStudies, listarVersoes: svc.listarVersoes } }));
vi.mock('../../services/opportunityProjectService', () => ({ opportunityProjectService: { listForOrg: svc.listForOrg } }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { listCompetitors: svc.listCompetitors },
}));
vi.mock('../../services/storageService', () => ({ storageService: {} }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import OpportunityForm from '../../components/investor/OpportunityForm';

const versao = (id: string, label: string, created_at: string) => ({ id, study_id: 'e1', label, notes: null, results: {}, created_at, created_by: null });

beforeEach(() => {
    svc.getStudies.mockResolvedValue([{ id: 'e1', name: 'Garden', version: '1.0' }, { id: 'e2', name: 'Outro', version: '1.0' }]);
    svc.listarVersoes.mockImplementation(async (id: string) => (id === 'e1' ? [versao('v2', 'Comitê de novembro', '2026-11-15T13:00:00Z'), versao('v1', 'Comitê de outubro', '2026-10-20T13:00:00Z')] : []));
    svc.listCompetitors.mockResolvedValue([]);
    svc.listForOrg.mockResolvedValue([]);
});

const publicar = () => screen.getByRole('button', { name: /Rascunho|Publicado/ });

describe('oportunidade com estudo do Imovib publica uma versão', () => {
    it('sem versão, publicar fica desligado e diz por quê; escolhida a versão, publica com ela', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        render(<OpportunityForm initial={{ title: 'Garden', imovib_study_id: 'e1' }} organizationId="org" onSave={onSave} onClose={vi.fn()} />);
        const seletor = await screen.findByLabelText('Versão que o investidor vê');
        await waitFor(() => expect(screen.getByRole('option', { name: /Comitê de novembro · 15\/11\/2026/ })).toBeTruthy());
        expect((publicar() as HTMLButtonElement).disabled).toBe(true);
        expect(publicar().closest('[title]')!.getAttribute('title')).toBe('Escolha a versão congelada do estudo que o investidor vai ver.');

        await user.selectOptions(seletor, 'v2');
        expect((publicar() as HTMLButtonElement).disabled).toBe(false);
        await user.click(publicar());
        await user.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imovib_study_id: 'e1', imovib_version_id: 'v2', is_published: true }), []);
    });

    it('trocar o estudo limpa a versão escolhida', async () => {
        const user = userEvent.setup();
        render(<OpportunityForm initial={{ title: 'Garden', imovib_study_id: 'e1', imovib_version_id: 'v1' }} organizationId="org" onSave={vi.fn()} onClose={vi.fn()} />);
        const seletor = await screen.findByLabelText('Versão que o investidor vê') as HTMLSelectElement;
        await waitFor(() => expect(seletor.value).toBe('v1'));
        await user.selectOptions(screen.getByLabelText('Estudo do Imovib'), 'e2');
        expect(await screen.findByText('Este estudo ainda não tem versão congelada: congele uma na aba Versões do estudo.')).toBeTruthy();
    });

    it('já publicada, trocar o estudo volta para rascunho e diz isso (o banco recusaria publicada sem versão)', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        render(<OpportunityForm initial={{ id: 'o1', title: 'Garden', imovib_study_id: 'e1', imovib_version_id: 'v1', is_published: true }} organizationId="org" onSave={onSave} onClose={vi.fn()} />);
        await screen.findByLabelText('Versão que o investidor vê');
        await user.selectOptions(screen.getByLabelText('Estudo do Imovib'), 'e2');
        expect(screen.getByText('Voltou para rascunho: escolha a versão do novo estudo para publicar de novo.')).toBeTruthy();
        expect(publicar().textContent).toContain('Rascunho');
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imovib_study_id: 'e2', imovib_version_id: null, is_published: false }), []);
    });

    it('falha ao ler as versões: diz que não leu, não que não há versão', async () => {
        svc.listarVersoes.mockRejectedValue(new Error('rede caiu'));
        render(<OpportunityForm initial={{ title: 'Garden', imovib_study_id: 'e1' }} organizationId="org" onSave={vi.fn()} onClose={vi.fn()} />);
        expect(await screen.findByText('Não foi possível ler as versões do estudo: rede caiu')).toBeTruthy();
        expect(screen.queryByText(/ainda não tem versão congelada/)).toBeNull();
    });
});
