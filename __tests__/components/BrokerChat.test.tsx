// @vitest-environment jsdom
/**
 * Chat por empreendimento com dado real (17/10/2026).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F5, decisão P2).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const garden = { building_id: 'b-1', nome: '011 - Garden Cambuhy', total: 2, ultima: { message: 'Tabela nova no ar', sender_type: 'INCORPORADORA', created_at: '2026-10-17T10:00:00Z' } };
const galeria = { building_id: 'b-2', nome: '010 - Galeria Altavista', total: 0, ultima: null };
const msgs = [
    { id: 'm-1', sender_name: 'Alpa', sender_email: 'gestor@alpa.com', sender_type: 'INCORPORADORA', message: 'Tabela nova no ar', is_pinned: true, created_at: '2026-10-17T10:00:00Z' },
    { id: 'm-2', sender_name: 'zoio', sender_email: 'devq1@gmail.com', sender_type: 'CORRETOR', message: 'Obrigado!', is_pinned: false, created_at: '2026-10-17T10:05:00Z' },
];

const svc = vi.hoisted(() => ({
    getChatCanaisByToken: vi.fn(),
    getChatMensagensByToken: vi.fn(),
    enviarChatByToken: vi.fn(async () => ({})),
}));
const gestor = vi.hoisted(() => ({
    chatGestorCanais: vi.fn(),
    chatGestorMensagens: vi.fn(),
    chatGestorEnviar: vi.fn(async () => ({})),
    chatGestorFixar: vi.fn(async () => {}),
}));
vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: svc }));
vi.mock('../../services/brokerService', () => ({ brokerService: gestor }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerChat from '../../components/broker/BrokerChat';

describe('BrokerChat', () => {
    beforeEach(() => {
        Object.values(svc).forEach(f => f.mockClear());
        Object.values(gestor).forEach(f => f.mockClear());
        svc.getChatCanaisByToken.mockResolvedValue([garden]);
        svc.getChatMensagensByToken.mockResolvedValue(msgs);
        gestor.chatGestorCanais.mockResolvedValue([garden, galeria]);
        gestor.chatGestorMensagens.mockResolvedValue(msgs);
    });

    it('corretor com um canal: abre direto, mostra fixadas e envia pelo token', async () => {
        const user = userEvent.setup();
        render(<BrokerChat brokerEmail="devq1@gmail.com" portalToken="tok" />);
        expect(await screen.findByText('Obrigado!')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Fixadas \(1\)/ })).toBeInTheDocument();
        expect(screen.getByText('Alpa · incorporadora')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Mensagem'), 'Tem vaga coberta?');
        await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
        expect(svc.enviarChatByToken).toHaveBeenCalledWith('tok', 'b-1', 'Tem vaga coberta?');
        expect(screen.queryByRole('button', { name: /fixar mensagem/i })).toBeNull();
    });

    it('corretor sem habilitação: explica em vez de mostrar canal vazio', async () => {
        svc.getChatCanaisByToken.mockResolvedValue([]);
        render(<BrokerChat brokerEmail="devq1@gmail.com" portalToken="tok" />);
        expect(await screen.findByText('Você ainda não está habilitado em nenhum empreendimento.')).toBeInTheDocument();
    });

    it('gestor: escolhe o canal, responde como incorporadora e fixa mensagem', async () => {
        const user = userEvent.setup();
        render(<BrokerChat brokerEmail="" organizationId="org-1" visao="gestor" />);
        await user.click(await screen.findByRole('button', { name: /Galeria Altavista/ }));
        await user.click(screen.getByRole('button', { name: 'Voltar aos canais' }));
        await user.click(screen.getByRole('button', { name: /Garden Cambuhy/ }));
        const msg = (await screen.findByText('Obrigado!')).closest('div.flex.justify-start, div.flex.justify-end')!.parentElement!;
        await user.click(within(msg).getAllByRole('button', { name: 'Fixar mensagem' })[0]);
        expect(gestor.chatGestorFixar).toHaveBeenCalledWith('m-2', true);
        await user.type(screen.getByLabelText('Mensagem'), 'Plantão sábado');
        await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
        expect(gestor.chatGestorEnviar).toHaveBeenCalledWith('b-1', 'Plantão sábado');
    });
});
