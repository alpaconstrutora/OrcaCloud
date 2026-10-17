// @vitest-environment jsdom
/**
 * Leads do corretor com dado real (17/10/2026).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F3, decisão P4).
 *   - corretor pelo link: cria, muda etapa e registra contato pelas RPCs do token;
 *   - gestor (visão interna): lê os leads da organização, com o corretor de cada um, sem gravar.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const leadZoio = {
    id: 'l-1', broker_email: 'devq1@gmail.com', name: 'Maria Prova', phone: '(35) 99999-0000', email: 'maria@x.com',
    origin: 'PLANTAO', stage: 'LEAD', interest: '3 dormitórios', notes: null, created_at: '2026-10-10T12:00:00Z',
    interacoes: [{ id: 'i-1', type: 'NOTE', description: 'Lead cadastrado', created_at: '2026-10-10T12:00:00Z' }],
};
const leadOutro = { ...leadZoio, id: 'l-2', broker_email: 'outro@corretor.com', name: 'João Teste', stage: 'VISITA', interacoes: [] };

const svc = vi.hoisted(() => ({
    getLeadsByToken: vi.fn(),
    salvarLeadByToken: vi.fn(async () => ({ id: 'l-9' })),
    etapaLeadByToken: vi.fn(async () => ({})),
    interacaoLeadByToken: vi.fn(async () => ({})),
}));
vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: svc }));
vi.mock('../../services/brokerService', () => ({ brokerService: { listLeadsDaOrganizacao: vi.fn(async () => [leadZoio, leadOutro]) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerLeadManager from '../../components/broker/BrokerLeadManager';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = (props: Partial<React.ComponentProps<typeof BrokerLeadManager>>) => render(
    <ConfirmProvider><BrokerLeadManager brokerEmail="devq1@gmail.com" {...props} /></ConfirmProvider>,
);

describe('BrokerLeadManager', () => {
    beforeEach(() => {
        localStorage.clear();
        svc.getLeadsByToken.mockResolvedValue([leadZoio]);
        Object.values(svc).forEach(f => f.mockClear());
    });

    it('corretor: lista os próprios leads e filtra por etapa', async () => {
        const user = userEvent.setup();
        montar({ portalToken: 'tok' });
        expect(await screen.findByText('Maria Prova')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lead (1)' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Visita (0)' }));
        expect(screen.getByText('Nenhum lead com esse filtro.')).toBeInTheDocument();
    });

    it('corretor: muda a etapa e registra contato pelas RPCs do token', async () => {
        const user = userEvent.setup();
        montar({ portalToken: 'tok' });
        await user.click(await screen.findByRole('button', { name: /Maria Prova/ }));
        const etapas = screen.getByRole('group', { name: 'Etapa do lead' });
        await user.click(within(etapas).getByRole('button', { name: 'Visita' }));
        expect(svc.etapaLeadByToken).toHaveBeenCalledWith('tok', 'l-1', 'VISITA');

        await user.selectOptions(screen.getByLabelText('Tipo de contato'), 'WHATSAPP');
        await user.type(screen.getByLabelText('Descrição do contato'), 'Agendou visita');
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        expect(svc.interacaoLeadByToken).toHaveBeenCalledWith('tok', 'l-1', 'WHATSAPP', 'Agendou visita');
    });

    it('corretor: novo lead exige nome e grava com a origem escolhida', async () => {
        const user = userEvent.setup();
        montar({ portalToken: 'tok' });
        await screen.findByText('Maria Prova');
        await user.click(screen.getByRole('button', { name: /novo lead/i }));
        const cadastrar = screen.getByRole('button', { name: 'Cadastrar' });
        expect(cadastrar).toBeDisabled();
        expect(cadastrar).toHaveAttribute('title', 'Informe o nome do lead');
        await user.type(screen.getByPlaceholderText('Nome completo'), 'Carlos Novo');
        await user.click(cadastrar);
        expect(svc.salvarLeadByToken).toHaveBeenCalledWith('tok', expect.objectContaining({ name: 'Carlos Novo', origin: 'DIRETO', id: null }));
    });

    it('gestor: vê os leads da organização com o corretor de cada um, sem gravar', async () => {
        const user = userEvent.setup();
        montar({ organizationId: 'org-1', visao: 'gestor' });
        expect(await screen.findByText('João Teste')).toBeInTheDocument();
        expect(screen.getByText('outro@corretor.com')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /novo lead/i })).toBeNull();
        await user.click(screen.getByRole('button', { name: /Maria Prova/ }));
        expect(screen.queryByRole('group', { name: 'Etapa do lead' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar' })).toBeNull();
    });
});
