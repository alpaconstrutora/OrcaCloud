// @vitest-environment jsdom
/**
 * Configurações › WhatsApp & Integrações — bloco do WhatsApp do ÒPURA (OpenWA).
 * Piloto 23/11/2026, Tarefa 8. Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md.
 *
 * O que trava:
 *   1. a situação do número: conectado (com o número), número desconectado, ou
 *      máquina fora (sem sinal do worker há mais de 3 min — mesma regra do pedido);
 *   2. membro comum vê a situação, mas os interruptores ficam desligados e DIZEM o motivo;
 *   3. owner/admin da org do topo liga o uso (→ definirUso(org, true, true)) e
 *      troca o envio automático; desligar o uso pede confirmação;
 *   4. topo em "Todas": só a situação, controles desligados com o motivo (REGRA #5);
 *   5. superadmin vê "Mensagens sem pedido" e atribui uma a um pedido pelo número,
 *      com confirmação; os demais nem disparam a leitura.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const EMAIL_SUPER = 'super@exemplo.com';
const ORGS = [
    { id: 'org-a', name: 'Alpa', members: [
        { email: 'membro@exemplo.com', role: 'member' },
        { email: 'dono@exemplo.com', role: 'owner' },
    ] },
    { id: 'org-b', name: 'Beta', members: [{ email: 'dono@exemplo.com', role: 'admin' }] },
];
let orgIdDoTopo: string | null = 'org-a';
let emailDaSessao = 'membro@exemplo.com';

vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: orgIdDoTopo, isAllOrgs: !orgIdDoTopo, source: orgIdDoTopo ? 'organization' : 'all' }),
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ organizations: ORGS, session: { user: { email: emailDaSessao } } }),
}));
vi.mock('../../lib/acessoTotal', () => ({
    temAcessoTotal: (e: string | null | undefined) => e === EMAIL_SUPER,
}));

const svc = {
    situacao: vi.fn(),
    definirUso: vi.fn(),
    listarSemPedido: vi.fn(),
    atribuir: vi.fn(),
    pedidoPeloNumero: vi.fn(),
};
vi.mock('../../services/whatsappOpenwaService', () => ({
    whatsappOpenwaService: {
        situacao: (...a: unknown[]) => svc.situacao(...a),
        definirUso: (...a: unknown[]) => svc.definirUso(...a),
        listarSemPedido: (...a: unknown[]) => svc.listarSemPedido(...a),
        atribuir: (...a: unknown[]) => svc.atribuir(...a),
        pedidoPeloNumero: (...a: unknown[]) => svc.pedidoPeloNumero(...a),
    },
}));

import WhatsappOpenwaSettings, {
    MOTIVO_NAO_GESTOR_OPURA, MOTIVO_TODAS_OPURA, MOTIVO_LIGAR_USO_ANTES,
} from '../../components/settings/WhatsappOpenwaSettings';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';

const ROTULO_USO = 'Usar o WhatsApp do ÒPURA nesta organização';
const ROTULO_AUTO = 'Enviar o pedido automaticamente ao marcar Enviado';

const haMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const linha = (o: Record<string, unknown>) => ({
    organizationId: 'org-a', estado: 'conectado', numeroExibicao: '+55 11 99999-0000', vistoEm: haMin(1),
    usaNaOrg: false, envioAutomaticoPedido: false, ...o,
});

const montar = () => render(<ConfirmProvider><ToastProvider><WhatsappOpenwaSettings /></ToastProvider></ConfirmProvider>);

beforeEach(() => {
    orgIdDoTopo = 'org-a';
    emailDaSessao = 'membro@exemplo.com';
    localStorage.clear();
    Object.values(svc).forEach(f => f.mockReset());
    svc.listarSemPedido.mockResolvedValue([]);
});

describe('WhatsappOpenwaSettings', () => {
    it('membro comum vê a situação, mas os interruptores ficam desligados e dizem por quê', async () => {
        svc.situacao.mockResolvedValue([linha({ usaNaOrg: true, envioAutomaticoPedido: true })]);
        montar();
        expect(await screen.findByText('Conectado · +55 11 99999-0000')).toBeInTheDocument();
        const uso = screen.getByRole('checkbox', { name: ROTULO_USO });
        expect(uso).toBeChecked();
        expect(uso).toBeDisabled();
        expect(uso.closest('label')).toHaveAttribute('title', MOTIVO_NAO_GESTOR_OPURA);
        const auto = screen.getByRole('checkbox', { name: ROTULO_AUTO });
        expect(auto).toBeDisabled();
        expect(auto.closest('label')).toHaveAttribute('title', MOTIVO_NAO_GESTOR_OPURA);
        // Triagem é só do superadmin: nem lê.
        expect(screen.queryByText('Mensagens sem pedido')).not.toBeInTheDocument();
        expect(svc.listarSemPedido).not.toHaveBeenCalled();
    });

    it('owner liga o uso → definirUso(org, true, true); aí o envio automático fica disponível', async () => {
        const user = userEvent.setup();
        emailDaSessao = 'dono@exemplo.com';
        svc.situacao.mockResolvedValue([linha({ usaNaOrg: false })]);
        svc.definirUso.mockResolvedValue(undefined);
        montar();
        const uso = await screen.findByRole('checkbox', { name: ROTULO_USO });
        const auto = screen.getByRole('checkbox', { name: ROTULO_AUTO });
        expect(uso).toBeEnabled();
        expect(auto).toBeDisabled();
        expect(auto.closest('label')).toHaveAttribute('title', MOTIVO_LIGAR_USO_ANTES);

        await user.click(uso);
        await waitFor(() => expect(svc.definirUso).toHaveBeenCalledWith('org-a', true, true));
        await waitFor(() => expect(uso).toBeChecked());
        expect(auto).toBeEnabled();
        expect(auto).toBeChecked();
    });

    it('owner troca o envio automático sem mexer no uso; desligar o uso pede confirmação', async () => {
        const user = userEvent.setup();
        emailDaSessao = 'dono@exemplo.com';
        svc.situacao.mockResolvedValue([linha({ usaNaOrg: true, envioAutomaticoPedido: true })]);
        svc.definirUso.mockResolvedValue(undefined);
        montar();
        const auto = await screen.findByRole('checkbox', { name: ROTULO_AUTO });
        await user.click(auto);
        await waitFor(() => expect(svc.definirUso).toHaveBeenCalledWith('org-a', true, false));
        await waitFor(() => expect(auto).not.toBeChecked());

        svc.definirUso.mockClear();
        await user.click(screen.getByRole('checkbox', { name: ROTULO_USO }));
        await user.click(await screen.findByRole('button', { name: 'Desligar' }));
        await waitFor(() => expect(svc.definirUso).toHaveBeenCalledWith('org-a', false, null));
    });

    it('erro do banco ao gravar: o interruptor fica como estava e a mensagem aparece', async () => {
        const user = userEvent.setup();
        emailDaSessao = 'dono@exemplo.com';
        svc.situacao.mockResolvedValue([linha({ usaNaOrg: false })]);
        svc.definirUso.mockRejectedValue(new Error('só o proprietário ou um administrador da organização liga ou desliga o WhatsApp do ÒPURA'));
        montar();
        const uso = await screen.findByRole('checkbox', { name: ROTULO_USO });
        await user.click(uso);
        expect(await screen.findByRole('alert')).toHaveTextContent('só o proprietário');
        expect(uso).not.toBeChecked();
    });

    it('topo em "Todas": só a situação, controles desligados com o motivo', async () => {
        orgIdDoTopo = null;
        emailDaSessao = 'dono@exemplo.com';
        svc.situacao.mockResolvedValue([linha({ organizationId: 'org-a', usaNaOrg: true }), linha({ organizationId: 'org-b' })]);
        montar();
        expect(await screen.findByText('Conectado · +55 11 99999-0000')).toBeInTheDocument();
        for (const nome of [ROTULO_USO, ROTULO_AUTO]) {
            const s = screen.getByRole('checkbox', { name: nome });
            expect(s).toBeDisabled();
            expect(s.closest('label')).toHaveAttribute('title', MOTIVO_TODAS_OPURA);
        }
        expect(screen.getByText('Em uso em 1 de 2 organizações suas.')).toBeInTheDocument();
    });

    it('sem sinal do worker há 5 min → "Máquina fora"; número caído com o worker vivo → "Número desconectado"', async () => {
        svc.situacao.mockResolvedValue([linha({ estado: 'conectado', vistoEm: haMin(5) })]);
        const { unmount } = montar();
        expect(await screen.findByText('Máquina fora — os envios esperam na fila')).toBeInTheDocument();
        expect(screen.queryByText(/^Conectado/)).not.toBeInTheDocument();
        unmount();

        svc.situacao.mockResolvedValue([linha({ estado: 'aguardando_qr', vistoEm: haMin(1) })]);
        montar();
        expect(await screen.findByText('Número desconectado — ler o QR no painel do OpenWA na máquina')).toBeInTheDocument();
    });

    it('superadmin vê "Mensagens sem pedido" e atribui uma ao pedido pelo número, com confirmação', async () => {
        const user = userEvent.setup();
        emailDaSessao = EMAIL_SUPER;
        svc.situacao.mockResolvedValue([linha({})]);
        svc.listarSemPedido.mockResolvedValue([
            { id: 'm-1', telefone: '5511988887777', texto: 'O material sai amanhã', recebidoEm: '2026-11-23T10:00:00Z' },
        ]);
        svc.pedidoPeloNumero.mockResolvedValue({ id: 'po-7', numero: 'PC-0007', organizationId: 'org-b' });
        svc.atribuir.mockResolvedValue(undefined);
        montar();
        expect(await screen.findByText('Mensagens sem pedido')).toBeInTheDocument();
        const celula = await screen.findByText('O material sai amanhã');
        const tr = celula.closest('tr')!;
        await user.click(within(tr).getByRole('button', { name: 'Atribuir a um pedido' }));

        const numero = await screen.findByLabelText('Número do pedido');
        const atribuir = screen.getByRole('button', { name: 'Atribuir' });
        expect(atribuir).toBeDisabled();
        expect(atribuir.parentElement).toHaveAttribute('title', 'Informe o número do pedido.');
        await user.type(numero, 'PC-0007');
        await user.click(atribuir);

        await waitFor(() => expect(svc.pedidoPeloNumero).toHaveBeenCalledWith('PC-0007'));
        expect(await screen.findByText(/pedido PC-0007 de Beta/)).toBeInTheDocument();
        expect(svc.atribuir).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Confirmar atribuição' }));
        await waitFor(() => expect(svc.atribuir).toHaveBeenCalledWith('m-1', 'po-7'));
        await waitFor(() => expect(screen.queryByText('O material sai amanhã')).not.toBeInTheDocument());
    });

    it('superadmin: número que não existe não atribui e diz o motivo', async () => {
        const user = userEvent.setup();
        emailDaSessao = EMAIL_SUPER;
        svc.situacao.mockResolvedValue([linha({})]);
        svc.listarSemPedido.mockResolvedValue([
            { id: 'm-1', telefone: '5511988887777', texto: 'Oi', recebidoEm: '2026-11-23T10:00:00Z' },
        ]);
        svc.pedidoPeloNumero.mockResolvedValue(null);
        montar();
        const tr = (await screen.findByText('Oi')).closest('tr')!;
        await user.click(within(tr).getByRole('button', { name: 'Atribuir a um pedido' }));
        await user.type(await screen.findByLabelText('Número do pedido'), 'PC-9999');
        await user.click(screen.getByRole('button', { name: 'Atribuir' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Nenhum pedido com o número PC-9999.');
        expect(svc.atribuir).not.toHaveBeenCalled();
    });
});
