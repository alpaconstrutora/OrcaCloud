// @vitest-environment jsdom
/**
 * Treinamento do corretor pela Academia (17/10/2026).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F6, decisão P1).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const comCursos = {
    valid: true, email: 'devq1@gmail.com', acesso: true, bloqueado: false, convidado_em: '2026-10-17', ultimo_acesso: null,
    matriculas: [
        { id: 'm1', curso: 'Produto Garden Cambuhy', status: 'EM_ANDAMENTO', percentual: 40, data_limite: '2026-11-30', carga_horaria: 4 },
        { id: 'm2', curso: 'Técnicas de venda', status: 'CONCLUIDO', percentual: 100, data_conclusao: '2026-10-10' },
    ],
};

const svc = vi.hoisted(() => ({ getTreinamentosByToken: vi.fn() }));
const gestor = vi.hoisted(() => ({ treinamentosDoCorretor: vi.fn() }));
const academia = vi.hoisted(() => ({ create: vi.fn(async () => ({ id: 'a-1' })), invite: vi.fn(async () => ({ kind: 'invite' })) }));
vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: svc }));
vi.mock('../../services/brokerService', () => ({ brokerService: gestor }));
vi.mock('../../services/academyPortalUsersService', () => ({ academyPortalUsersService: academia }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerTraining from '../../components/broker/BrokerTraining';

describe('BrokerTraining', () => {
    beforeEach(() => {
        [svc, gestor, academia].forEach(o => Object.values(o).forEach(f => (f as ReturnType<typeof vi.fn>).mockClear()));
    });

    it('corretor com acesso: cursos com status da Academia e o link da sala de aula', async () => {
        svc.getTreinamentosByToken.mockResolvedValue(comCursos);
        render(<BrokerTraining brokerEmail="" portalToken="tok" />);
        expect(await screen.findByText('Produto Garden Cambuhy')).toBeInTheDocument();
        expect(screen.getByText('Em andamento')).toBeInTheDocument();
        expect(screen.getByText('Concluído')).toBeInTheDocument();
        expect(screen.getByText(/1 de 2/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /abrir sala de aula/i })).toHaveAttribute('href', expect.stringContaining('/portal-treinamentos'));
    });

    it('corretor sem acesso: diz que a incorporadora ainda não liberou', async () => {
        svc.getTreinamentosByToken.mockResolvedValue({ valid: true, acesso: false, bloqueado: false, matriculas: [] });
        render(<BrokerTraining brokerEmail="" portalToken="tok" />);
        expect(await screen.findByText('A incorporadora ainda não liberou treinamentos para você.')).toBeInTheDocument();
    });

    it('gestor: libera o corretor como terceiro da Academia e depois envia o convite', async () => {
        const user = userEvent.setup();
        gestor.treinamentosDoCorretor
            .mockResolvedValueOnce({ acesso: false, bloqueado: false, matriculas: [] })
            .mockResolvedValue({ acesso: true, acesso_id: 'a-1', bloqueado: false, convidado_em: null, matriculas: [] });
        render(<BrokerTraining brokerEmail="devq1@gmail.com" organizationId="org-1" visao="gestor"
            corretor={{ name: 'zoio', email: 'devq1@gmail.com', phone: '35 9999', agency_name: 'Imob X' }} />);
        await user.click(await screen.findByRole('button', { name: /liberar portal de treinamentos/i }));
        expect(academia.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1', tipo: 'TERCEIRO', email: 'devq1@gmail.com', name: 'zoio', empresaTerceira: 'Imob X' }));
        await user.click(await screen.findByRole('button', { name: /enviar convite por e-mail/i }));
        expect(academia.invite).toHaveBeenCalledWith('a-1');
        expect(await screen.findByText('Convite enviado para devq1@gmail.com.')).toBeInTheDocument();
    });

    it('gestor sem corretor aberto: orienta a abrir um', async () => {
        // brokerEmail aqui é o do próprio administrador: não pode virar "o corretor"
        render(<BrokerTraining brokerEmail="admin@alpa.com" organizationId="org-1" visao="gestor" />);
        expect(await screen.findByText('Abra o portal de um corretor para cuidar do treinamento dele.')).toBeInTheDocument();
        expect(gestor.treinamentosDoCorretor).not.toHaveBeenCalled();
    });
});
