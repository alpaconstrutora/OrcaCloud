// @vitest-environment jsdom
/**
 * Configurações › WhatsApp — token por organização, no servidor (achado F75, 18/11/2026).
 *
 * O que trava:
 *   1. a tela mostra "Configurado / Não configurado" e o que não é segredo — nunca o token;
 *   2. só proprietário/administrador configura: para os demais o botão fica desligado
 *      e DIZ o motivo (invólucro com `title`, §9.2);
 *   3. o formulário do token nasce SEMPRE vazio (antes voltava preenchido do
 *      localStorage, com botão de revelar) e salvar vai para o servidor;
 *   4. topo numa organização → só ela; "Todas" → todas as do usuário;
 *   5. o aviso de "token deste navegador apagado" aparece e some ao salvar;
 *   6. remover pede confirmação e vai para o servidor.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ORGS = [{ id: 'org-a', name: 'Alpa' }, { id: 'org-b', name: 'Beta' }];
let orgIdDoTopo: string | null = null;

vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: orgIdDoTopo, isAllOrgs: !orgIdDoTopo, source: orgIdDoTopo ? 'organization' : 'all' }),
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: { organizations: typeof ORGS }) => unknown) => sel({ organizations: ORGS }),
}));

const svc = {
    situacao: vi.fn(),
    salvar: vi.fn(),
    remover: vi.fn(),
};
vi.mock('../../services/whatsappService', () => ({
    TEMPLATE_PEDIDO_SUGERIDO: 'opura_pedido_enviado',
    whatsappService: {
        situacao: (...a: unknown[]) => svc.situacao(...a),
        salvar: (...a: unknown[]) => svc.salvar(...a),
        remover: (...a: unknown[]) => svc.remover(...a),
    },
}));

import WhatsappCloudSettings, { MOTIVO_NAO_GESTOR } from '../../components/settings/WhatsappCloudSettings';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { CHAVE_AVISO_TOKEN_LEGADO } from '../../lib/whatsappLegado';

const situacao = (o: Record<string, unknown>) => ({
    organizationId: 'org-a', configurado: false, phoneNumberId: null, numeroExibicao: null, nomeVerificado: null,
    templatePedido: null, tokenAtualizadoEm: null, tokenAtualizadoPor: null, podeConfigurar: false, ...o,
});

const montar = () => render(<ConfirmProvider><ToastProvider><WhatsappCloudSettings /></ToastProvider></ConfirmProvider>);

beforeEach(() => {
    orgIdDoTopo = null;
    localStorage.clear();
    svc.situacao.mockReset();
    svc.salvar.mockReset();
    svc.remover.mockReset();
});

describe('WhatsappCloudSettings', () => {
    it('membro comum vê a situação, mas o botão fica desligado e diz por quê', async () => {
        svc.situacao.mockResolvedValue([
            situacao({ organizationId: 'org-a', configurado: true, phoneNumberId: '123456789', numeroExibicao: '+55 11 99999-0000', nomeVerificado: 'Alpa', podeConfigurar: false }),
        ]);
        montar();
        const linha = (await screen.findByText('Alpa')).closest('li')!;
        expect(within(linha).getByText('Configurado')).toBeInTheDocument();
        expect(within(linha).getByText(/\+55 11 99999-0000/)).toBeInTheDocument();
        const botao = within(linha).getByRole('button', { name: 'Trocar token' });
        expect(botao).toBeDisabled();
        expect(botao.parentElement).toHaveAttribute('title', MOTIVO_NAO_GESTOR);
        const remover = within(linha).getByRole('button', { name: 'Remover o token desta organização' });
        expect(remover).toBeDisabled();
        expect(remover.parentElement).toHaveAttribute('title', MOTIVO_NAO_GESTOR);
    });

    it('gestor configura: o token nasce vazio e salvar vai para o servidor', async () => {
        const user = userEvent.setup();
        svc.situacao.mockResolvedValue([situacao({ organizationId: 'org-a', configurado: false, podeConfigurar: true })]);
        svc.salvar.mockResolvedValue({ numeroExibicao: '+55 11 99999-0000', nomeVerificado: 'Alpa' });
        montar();
        const linha = (await screen.findByText('Alpa')).closest('li')!;
        expect(within(linha).getByText('Não configurado')).toBeInTheDocument();
        await user.click(within(linha).getByRole('button', { name: 'Configurar' }));

        const token = await screen.findByLabelText('Token de acesso');
        expect(token).toHaveValue('');
        expect(token).toHaveAttribute('type', 'password');
        expect(screen.getByLabelText('Template de pedido enviado')).toHaveValue('opura_pedido_enviado');

        const salvarBotao = screen.getByRole('button', { name: /Testar e salvar/ });
        expect(salvarBotao).toBeDisabled();
        expect(salvarBotao.parentElement).toHaveAttribute('title', 'Informe o Phone Number ID (só dígitos).');

        await user.type(screen.getByLabelText('Phone Number ID'), '123456789');
        expect(salvarBotao.parentElement).toHaveAttribute('title', 'Cole o token para salvar.');
        await user.type(token, 'EAAG-SEGREDO');
        expect(salvarBotao).toBeEnabled();
        await user.click(salvarBotao);

        await waitFor(() => expect(svc.salvar).toHaveBeenCalledWith({
            organizationId: 'org-a', phoneNumberId: '123456789', token: 'EAAG-SEGREDO', templatePedido: 'opura_pedido_enviado',
        }));
        await waitFor(() => expect(within(linha).getByText('Configurado')).toBeInTheDocument());
        expect(screen.queryByLabelText('Token de acesso')).not.toBeInTheDocument();
        // O token não fica em lugar nenhum do navegador.
        expect(JSON.stringify({ ...localStorage })).not.toContain('EAAG-SEGREDO');
        expect(document.body.innerHTML).not.toContain('EAAG-SEGREDO');
    });

    it('trocar token de organização já configurada: campo vazio, número preenchido', async () => {
        const user = userEvent.setup();
        svc.situacao.mockResolvedValue([situacao({ configurado: true, phoneNumberId: '123456789', templatePedido: 'meu_template', podeConfigurar: true })]);
        montar();
        await user.click(await screen.findByRole('button', { name: 'Trocar token' }));
        expect(await screen.findByLabelText('Token de acesso')).toHaveValue('');
        expect(screen.getByLabelText('Phone Number ID')).toHaveValue('123456789');
        expect(screen.getByLabelText('Template de pedido enviado')).toHaveValue('meu_template');
        // Configurada: dá para salvar sem token (mantém o guardado).
        expect(screen.getByRole('button', { name: /Testar e salvar/ })).toBeEnabled();
    });

    it('erro do servidor (ex.: Meta recusou o token) aparece no formulário', async () => {
        const user = userEvent.setup();
        svc.situacao.mockResolvedValue([situacao({ podeConfigurar: true })]);
        svc.salvar.mockRejectedValue(new Error('A Meta recusou este token para o Phone Number ID 123456789: Invalid OAuth access token.'));
        montar();
        await user.click(await screen.findByRole('button', { name: 'Configurar' }));
        await user.type(await screen.findByLabelText('Phone Number ID'), '123456789');
        await user.type(screen.getByLabelText('Token de acesso'), 'ruim');
        await user.click(screen.getByRole('button', { name: /Testar e salvar/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('A Meta recusou este token');
    });

    it('topo numa organização mostra só ela; "Todas" mostra todas as do usuário', async () => {
        svc.situacao.mockResolvedValue([
            situacao({ organizationId: 'org-a' }),
            situacao({ organizationId: 'org-b', podeConfigurar: true }),
        ]);
        orgIdDoTopo = 'org-b';
        const { unmount } = montar();
        expect(await screen.findByText('Beta')).toBeInTheDocument();
        expect(screen.queryByText('Alpa')).not.toBeInTheDocument();
        unmount();

        orgIdDoTopo = null;
        montar();
        expect(await screen.findByText('Alpa')).toBeInTheDocument();
        expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('aviso de token apagado deste navegador: aparece, e some ao salvar', async () => {
        const user = userEvent.setup();
        localStorage.setItem(CHAVE_AVISO_TOKEN_LEGADO, '2026-11-18T12:00:00.000Z');
        svc.situacao.mockResolvedValue([situacao({ podeConfigurar: true })]);
        svc.salvar.mockResolvedValue({ numeroExibicao: null, nomeVerificado: null });
        montar();
        expect(await screen.findByText('O token do WhatsApp salvo neste navegador foi apagado')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Configurar' }));
        await user.type(await screen.findByLabelText('Phone Number ID'), '123456789');
        await user.type(screen.getByLabelText('Token de acesso'), 'EAAG');
        await user.click(screen.getByRole('button', { name: /Testar e salvar/ }));

        await waitFor(() => expect(screen.queryByText('O token do WhatsApp salvo neste navegador foi apagado')).not.toBeInTheDocument());
        expect(localStorage.getItem(CHAVE_AVISO_TOKEN_LEGADO)).toBeNull();
    });

    it('remover pede confirmação e vai para o servidor', async () => {
        const user = userEvent.setup();
        svc.situacao.mockResolvedValue([situacao({ configurado: true, phoneNumberId: '123456789', podeConfigurar: true })]);
        svc.remover.mockResolvedValue(undefined);
        montar();
        await user.click(await screen.findByRole('button', { name: 'Remover o token desta organização' }));
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        await waitFor(() => expect(svc.remover).toHaveBeenCalledWith('org-a'));
        expect(await screen.findByText('Não configurado')).toBeInTheDocument();
    });
});
