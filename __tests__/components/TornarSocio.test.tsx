// @vitest-environment jsdom
/**
 * Interesse "Fechado" vira sócio da SPE (Fase 4 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    listInterests: vi.fn(), updateInterestStage: vi.fn(), vincularInvestorAoInteresse: vi.fn(),
    listInvestors: vi.fn(), getByEmail: vi.fn(), saveInvestor: vi.fn(), savePartner: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: { listInterests: svc.listInterests, updateInterestStage: svc.updateInterestStage, vincularInvestorAoInteresse: svc.vincularInvestorAoInteresse },
}));
vi.mock('../../services/investorService', () => ({ investorService: { listInvestors: svc.listInvestors, getByEmail: svc.getByEmail, saveInvestor: svc.saveInvestor } }));
vi.mock('../../services/speService', () => ({ speService: { savePartner: svc.savePartner } }));

import InterestsPanelBase from '../../components/investor/InterestsPanel';
import { ConfirmProvider } from '../../components/ui/confirm';
const InterestsPanel = (p: React.ComponentProps<typeof InterestsPanelBase>) => <ConfirmProvider><InterestsPanelBase {...p} /></ConfirmProvider>;

const comSpe = { id: 'op1', organization_id: 'org', title: 'Garden', spe_entity_id: 'spe1' } as never;
const semSpe = { id: 'op2', organization_id: 'org', title: 'Quintino', spe_entity_id: null } as never;
const interesse = (extra: object) => ({ id: 'i1', organization_id: 'org', opportunity_id: 'op1', contact_name: 'Tiago', contact_email: 'tiago@x.com', role: 'investidor', stage: 'fechado', valor_pretendido: 200000, ...extra });

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.savePartner.mockResolvedValue({});
    svc.vincularInvestorAoInteresse.mockResolvedValue(undefined);
});

describe('Tornar sócio', () => {
    it('investidor do link: vira sócio da SPE da oportunidade com a participação informada', async () => {
        const user = userEvent.setup();
        svc.listInterests.mockResolvedValue([interesse({ investor_id: 'inv1' })]);
        svc.listInvestors.mockResolvedValue([{ id: 'inv1', name: 'Tiago Investidor' }]);
        render(<InterestsPanel organizationId="org" opportunities={[comSpe]} />);
        // Lista: o valor na coluna "Valor pretendido" e no indicador do mesmo nome.
        expect((await screen.findAllByText(/R\$\s?200\.000/)).length).toBe(2);
        await user.click(screen.getByRole('button', { name: /Tornar sócio/ }));
        expect(await screen.findByText('Tiago Investidor')).toBeTruthy();
        await user.type(screen.getByLabelText('Participação na SPE (%)'), '5');
        const dialogo = screen.getByRole('dialog');
        await user.click(within(dialogo).getByRole('button', { name: 'Tornar sócio' }));
        await waitFor(() => expect(svc.savePartner).toHaveBeenCalledWith(expect.objectContaining({ spe_entity_id: 'spe1', investor_id: 'inv1', ownership_pct: 5 })));
        expect(svc.vincularInvestorAoInteresse).toHaveBeenCalledWith('i1', 'inv1');
        expect(svc.saveInvestor).not.toHaveBeenCalled();
    });

    it('sem investidor nem cadastro com o e-mail: cadastra um novo com os dados do interesse', async () => {
        const user = userEvent.setup();
        svc.listInterests.mockResolvedValue([interesse({ investor_id: null })]);
        svc.getByEmail.mockResolvedValue(null);
        svc.saveInvestor.mockResolvedValue({ id: 'novo1', name: 'Tiago' });
        render(<InterestsPanel organizationId="org" opportunities={[comSpe]} />);
        await user.click(await screen.findByRole('button', { name: /Tornar sócio/ }));
        expect(await screen.findByText('Novo cadastro: Tiago')).toBeTruthy();
        await user.type(screen.getByLabelText('Participação na SPE (%)'), '2.5');
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tornar sócio' }));
        await waitFor(() => expect(svc.saveInvestor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tiago', email: 'tiago@x.com', organization_id: 'org' })));
        expect(svc.savePartner).toHaveBeenCalledWith(expect.objectContaining({ investor_id: 'novo1', ownership_pct: 2.5 }));
    });

    it('oportunidade sem SPE: o botão fica desligado e diz por quê', async () => {
        svc.listInterests.mockResolvedValue([interesse({ opportunity_id: 'op2' })]);
        render(<InterestsPanel organizationId="org" opportunities={[semSpe]} />);
        const botao = await screen.findByRole('button', { name: /Tornar sócio/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.closest('[title]')!.getAttribute('title')).toMatch(/não tem SPE/);
    });
});
