// @vitest-environment jsdom
/**
 * Agenda do corretor com dado real (17/10/2026).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F4, decisão P4).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const em3dias = new Date(Date.now() + 3 * 86400000).toISOString();
const plantao = { id: 'e-1', title: 'Plantão de sábado', type: 'PLANTAO', date: em3dias, location: 'Stand', max_capacity: 10, status: 'ABERTO', inscritos: 2, minha_inscricao: null };
const lotado = { id: 'e-2', title: 'Visita lotada', type: 'VISITA_OBRA', date: em3dias, max_capacity: 1, status: 'ABERTO', inscritos: 1, minha_inscricao: null };

const svc = vi.hoisted(() => ({
    getEventosByToken: vi.fn(),
    inscreverEventoByToken: vi.fn(async () => ({})),
    cancelarInscricaoByToken: vi.fn(async () => ({})),
}));
const gestor = vi.hoisted(() => ({
    listEventos: vi.fn(),
    salvarEvento: vi.fn(async () => ({ id: 'novo' })),
    cancelarEvento: vi.fn(async () => {}),
}));
vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: svc }));
vi.mock('../../services/brokerService', () => ({ brokerService: gestor }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerEvents, { situacaoDoEvento } from '../../components/broker/BrokerEvents';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = (props: Partial<React.ComponentProps<typeof BrokerEvents>>) => render(
    <ConfirmProvider><BrokerEvents brokerEmail="devq1@gmail.com" {...props} /></ConfirmProvider>,
);

describe('BrokerEvents', () => {
    beforeEach(() => {
        Object.values(svc).forEach(f => f.mockClear());
        Object.values(gestor).forEach(f => f.mockClear());
        svc.getEventosByToken.mockResolvedValue([plantao, lotado]);
        gestor.listEventos.mockResolvedValue([{ ...plantao, inscricoes: [{ id: 'r1', broker_email: 'devq1@gmail.com', status: 'CONFIRMADA' }, { id: 'r2', broker_email: 'x@y.com', status: 'CANCELADA' }] }]);
    });

    it('corretor: inscreve-se pelo token; evento lotado trava o botão dizendo por quê', async () => {
        const user = userEvent.setup();
        montar({ portalToken: 'tok' });
        const card = (await screen.findByText('Plantão de sábado')).closest('li')!;
        expect(card.textContent).toContain('2 de 10 vagas');
        await user.click(within(card).getByRole('button', { name: 'Inscrever-me' }));
        expect(svc.inscreverEventoByToken).toHaveBeenCalledWith('tok', 'e-1');

        const cheio = screen.getByText('Visita lotada').closest('li')!;
        const botao = within(cheio).getByRole('button', { name: 'Lotado' });
        expect(botao).toBeDisabled();
        expect(botao).toHaveAttribute('title', 'Lotado');
    });

    it('corretor inscrito: cancela a inscrição', async () => {
        const user = userEvent.setup();
        svc.getEventosByToken.mockResolvedValue([{ ...plantao, minha_inscricao: 'CONFIRMADA' }]);
        montar({ portalToken: 'tok' });
        await user.click(await screen.findByRole('button', { name: 'Cancelar inscrição' }));
        expect(svc.cancelarInscricaoByToken).toHaveBeenCalledWith('tok', 'e-1');
    });

    it('gestor: conta só as inscrições ativas, cria evento e não oferece inscrição', async () => {
        const user = userEvent.setup();
        montar({ organizationId: 'org-1', visao: 'gestor' });
        const card = (await screen.findByText('Plantão de sábado')).closest('li')!;
        expect(card.textContent).toContain('1 de 10 vagas'); // a CANCELADA não conta
        expect(within(card).queryByRole('button', { name: 'Inscrever-me' })).toBeNull();

        await user.click(screen.getByRole('button', { name: /novo evento/i }));
        const criar = screen.getByRole('button', { name: 'Criar evento' });
        expect(criar).toBeDisabled();
        await user.type(screen.getByPlaceholderText('Ex.: Plantão de vendas — fim de semana'), 'Lançamento Torre B');
        const inicio = screen.getByText('Início *').parentElement!.querySelector('input')!;
        await user.type(inicio, '2026-12-05T10:00');
        await user.click(criar);
        expect(gestor.salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org-1', title: 'Lançamento Torre B', status: 'ABERTO' }));
    });

    it('situação: cancelado e lotado gravados/calculados; passado vira "Já aconteceu"', () => {
        expect(situacaoDoEvento({ ...plantao, status: 'CANCELADO' } as never).id).toBe('CANCELADO');
        expect(situacaoDoEvento(lotado as never).id).toBe('LOTADO');
        expect(situacaoDoEvento({ ...plantao, date: '2020-01-01T00:00:00Z' } as never).id).toBe('PASSADO');
        expect(situacaoDoEvento(plantao as never).id).toBe('ABERTO');
    });
});
