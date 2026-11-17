// @vitest-environment jsdom
/**
 * Comunicados no portal do investidor (pelo link) — votar (17/11/2026, pedido "implemente o Ficou de
 * fora"; plano docs/planos/2026-11-17-investidor-comunicados-voto-e-trava.md).
 *
 * O que estes testes seguram:
 * - votação mostra Sim / Não / Abstenção; o voto só sai no 2º clique ("Confirmar voto"), porque é
 *   definitivo — a RPC não troca a 1ª resposta;
 * - recusa do banco (`{valid:false}`) aparece como mensagem e NÃO marca respondido (antes passava calada);
 * - respondido mostra o voto e a data; aviso segue com "Confirmar"; sem link (prévia) não há botão.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ ack: vi.fn() }));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../services/investorPortalTokenService', () => {
    class RespostaRecusadaError extends Error {}
    return { investorPortalTokenService: { acknowledgeByToken: h.ack }, RespostaRecusadaError };
});

import PortalAnnouncements from '../../components/investor/portal/PortalAnnouncements';
import { RespostaRecusadaError } from '../../services/investorPortalTokenService';

const votacao = {
    id: 'v1', type: 'votacao', title: 'Aprovar a distribuição', body: 'Proposta de distribuir R$ 100 mil.',
    published_at: '2026-11-10T12:00:00Z', requires_acknowledgment: true, acknowledged: false, vote_option: null,
};
const aviso = {
    id: 'a1', type: 'aviso', title: 'Assembleia dia 20', body: 'Local: sede.',
    published_at: '2026-11-09T12:00:00Z', requires_acknowledgment: true, acknowledged: false, vote_option: null,
};

const montar = (announcements: unknown[], { semLink = false } = {}) => {
    const onAcknowledged = vi.fn();
    render(<PortalAnnouncements announcements={announcements as never[]} portalToken={semLink ? undefined : 'tok'} onAcknowledged={onAcknowledged} />);
    return { onAcknowledged };
};

beforeEach(() => { h.ack.mockReset(); });

describe('PortalAnnouncements — votação pelo link', () => {
    it('mostra o tipo com rótulo, as 3 opções e conta a votação como pendente', () => {
        montar([votacao]);
        expect(screen.getByText('Votação')).toBeTruthy();
        expect(screen.getByText('1 aguardando sua resposta')).toBeTruthy();
        for (const nome of ['Sim', 'Não', 'Abstenção']) expect(screen.getByRole('button', { name: nome })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Confirmar$/ })).toBeNull();
    });

    it('escolher NÃO envia: pede confirmação; "Voltar" desfaz a escolha', async () => {
        const user = userEvent.setup();
        montar([votacao]);
        await user.click(screen.getByRole('button', { name: 'Não' }));
        expect(screen.getByText(/o voto não pode ser mudado/)).toBeTruthy();
        expect(h.ack).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(screen.getByRole('button', { name: 'Sim' })).toBeTruthy();
        expect(h.ack).not.toHaveBeenCalled();
    });

    it('confirmar o voto envia a opção e devolve o que ficou gravado', async () => {
        const user = userEvent.setup();
        h.ack.mockResolvedValue({ vote_option: 'sim', acknowledged_at: '2026-11-17T15:00:00Z' });
        const { onAcknowledged } = montar([votacao]);
        await user.click(screen.getByRole('button', { name: 'Sim' }));
        await user.click(screen.getByRole('button', { name: /Confirmar voto/ }));
        await waitFor(() => expect(onAcknowledged).toHaveBeenCalled());
        expect(h.ack).toHaveBeenCalledWith('tok', 'v1', 'sim');
        expect(onAcknowledged).toHaveBeenCalledWith('v1', { vote_option: 'sim', acknowledged_at: '2026-11-17T15:00:00Z' });
    });

    it('recusa do banco aparece como mensagem e não marca respondido', async () => {
        const user = userEvent.setup();
        h.ack.mockRejectedValue(new RespostaRecusadaError('O link do portal venceu ou foi desativado.'));
        const { onAcknowledged } = montar([votacao]);
        await user.click(screen.getByRole('button', { name: 'Abstenção' }));
        await user.click(screen.getByRole('button', { name: /Confirmar voto/ }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/link do portal venceu/);
        expect(onAcknowledged).not.toHaveBeenCalled();
    });

    it('responder OUTRO comunicado não apaga o aviso de erro do primeiro', async () => {
        const user = userEvent.setup();
        h.ack.mockImplementation((_t: string, id: string) => id === 'v1'
            ? Promise.reject(new RespostaRecusadaError('Este comunicado não está mais disponível.'))
            : Promise.resolve({ vote_option: null, acknowledged_at: '2026-11-17T15:00:00Z' }));
        montar([votacao, aviso]);
        await user.click(screen.getByRole('button', { name: 'Sim' }));
        await user.click(screen.getByRole('button', { name: /Confirmar voto/ }));
        await screen.findByRole('alert');
        await user.click(screen.getByRole('button', { name: /^Confirmar$/ }));
        await waitFor(() => expect(h.ack).toHaveBeenCalledTimes(2));
        expect(screen.getByRole('alert').textContent).toMatch(/não está mais disponível/);
    });

    it('falha de rede vira mensagem genérica (não o texto técnico)', async () => {
        const user = userEvent.setup();
        h.ack.mockRejectedValue(new TypeError('Failed to fetch'));
        montar([votacao]);
        await user.click(screen.getByRole('button', { name: 'Sim' }));
        await user.click(screen.getByRole('button', { name: /Confirmar voto/ }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Não foi possível enviar agora/);
    });

    it('votação respondida mostra o voto e a data, sem botões', () => {
        montar([{ ...votacao, acknowledged: true, vote_option: 'abstencao', acknowledged_at: '2026-11-12T15:00:00Z' }]);
        expect(screen.getByText('Seu voto: Abstenção')).toBeTruthy();
        expect(screen.getByText('em 12 de novembro de 2026')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByText(/aguardando sua resposta/)).toBeNull();
    });
});

describe('PortalAnnouncements — aviso e prévia', () => {
    it('aviso com pedido de confirmação segue com "Confirmar", sem voto', async () => {
        const user = userEvent.setup();
        h.ack.mockResolvedValue({ vote_option: null, acknowledged_at: '2026-11-17T15:00:00Z' });
        const { onAcknowledged } = montar([aviso]);
        expect(screen.queryByRole('button', { name: 'Sim' })).toBeNull();
        await user.click(screen.getByRole('button', { name: /^Confirmar$/ }));
        await waitFor(() => expect(onAcknowledged).toHaveBeenCalled());
        expect(h.ack).toHaveBeenCalledWith('tok', 'a1', undefined);
    });

    it('aviso respondido mostra "Confirmado"', () => {
        montar([{ ...aviso, acknowledged: true }]);
        expect(screen.getByText('Confirmado')).toBeTruthy();
    });

    it('sem link (prévia do gestor) não oferece voto nem confirmação', () => {
        montar([votacao, aviso], { semLink: true });
        expect(screen.queryByRole('button')).toBeNull();
    });
});
