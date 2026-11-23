// @vitest-environment jsdom
/**
 * Tela de criar/redefinir senha só grava na conta que o LINK identifica.
 *
 * 03/10/2026: as abas compartilham uma sessão; o desenvolvedor entrou em outra
 * aba com a tela do convite aberta e a sessão corrente virou a dele. A tela
 * mostrou o e-mail dele — e, reproduzido no navegador, gravaria a senha NA
 * CONTA DELE. Trava:
 *  1. sessão da pessoa do link → grava normalmente;
 *  2. sessão de outra conta ao abrir → sem formulário, aviso com os dois e-mails;
 *  3. conta trocada entre abrir e clicar → confere no servidor e não grava.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateUser = vi.fn(async () => ({ error: null }));
const getUser = vi.fn();
vi.mock('../../lib/supabase', () => ({
    supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a), getUser: () => getUser() } },
}));

import ResetPassword from '../../components/ResetPassword';

async function preencherESalvar() {
    const user = userEvent.setup();
    const senhas = screen.getAllByPlaceholderText('******');
    await user.type(senhas[0], 'SenhaNova123');
    await user.type(senhas[1], 'SenhaNova123');
    await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
}

describe('ResetPassword — conta do link', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('1. sessão da pessoa do link: mostra o e-mail e grava', async () => {
        getUser.mockResolvedValue({ data: { user: { email: 'parceiro@fornecedor.com' } } });
        render(<ResetPassword tipo="invite" email="parceiro@fornecedor.com" emailDoLink="parceiro@fornecedor.com" onComplete={vi.fn()} />);

        expect(screen.getByDisplayValue('parceiro@fornecedor.com')).toHaveAttribute('readonly');
        await preencherESalvar();
        await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'SenhaNova123' }));
    });

    it('2. sessão de outra conta ao abrir: sem formulário, aviso com os dois e-mails', () => {
        render(<ResetPassword tipo="invite" email="altair.rosa@alpaconstrutora.com.br" emailDoLink="parceiro@fornecedor.com" onComplete={vi.fn()} />);

        expect(screen.queryAllByPlaceholderText('******')).toHaveLength(0);
        expect(screen.getByText('parceiro@fornecedor.com')).toBeInTheDocument();
        expect(screen.getByText('altair.rosa@alpaconstrutora.com.br')).toBeInTheDocument();
        expect(screen.getByText(/nada será gravado aqui/)).toBeInTheDocument();
    });

    it('3. conta trocada entre abrir e clicar: confere no servidor e não grava', async () => {
        getUser.mockResolvedValue({ data: { user: { email: 'altair.rosa@alpaconstrutora.com.br' } } });
        render(<ResetPassword tipo="invite" email="parceiro@fornecedor.com" emailDoLink="parceiro@fornecedor.com" onComplete={vi.fn()} />);

        await preencherESalvar();
        expect(await screen.findByText(/Nada foi gravado/)).toBeInTheDocument();
        expect(updateUser).not.toHaveBeenCalled();
    });

    // 23/11/2026: logout com a tela aberta. A sessão sumiu, o formulário seguiu na
    // tela, e ao gravar a mensagem dizia "conectado como outra conta" — não havia conta.
    it('4. logout com a tela aberta: some o formulário e diz que a sessão terminou', () => {
        const props = { tipo: 'invite' as const, emailDoLink: 'parceiro@fornecedor.com', onComplete: vi.fn() };
        const { rerender } = render(<ResetPassword {...props} email="parceiro@fornecedor.com" />);
        expect(screen.getAllByPlaceholderText('******')).toHaveLength(2);

        rerender(<ResetPassword {...props} email={undefined} />);
        expect(screen.queryAllByPlaceholderText('******')).toHaveLength(0);
        expect(screen.getByText(/Você saiu da conta/)).toBeInTheDocument();
        expect(screen.queryByText(/outra conta/)).not.toBeInTheDocument();
    });

    it('5. sem sessão no servidor ao gravar: não grava e não fala em "outra conta"', async () => {
        getUser.mockResolvedValue({ data: { user: null } });
        render(<ResetPassword tipo="invite" email="parceiro@fornecedor.com" emailDoLink="parceiro@fornecedor.com" onComplete={vi.fn()} />);

        await preencherESalvar();
        expect(await screen.findByText(/não está mais conectado/)).toBeInTheDocument();
        expect(screen.queryByText(/outra conta/)).not.toBeInTheDocument();
        expect(updateUser).not.toHaveBeenCalled();
    });
});
