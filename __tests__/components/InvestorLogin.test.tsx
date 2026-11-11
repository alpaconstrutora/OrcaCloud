// @vitest-environment jsdom
/**
 * Login do Portal do Investidor (11/11/2026) — cartão com a troca animada
 * entrar ↔ criar conta (docs/planos/2026-11-11-login-investidor-animado.md).
 * Os dois formulários ficam no DOM para a animação; o escondido é `inert`. Trava:
 *  1. identidade, "Voltar para Portais" chama onBack, e só o lado ENTRAR é ativo;
 *  2. entrar marca o login NESTA aba antes do signIn, com e-mail normalizado;
 *  3. erro do Supabase em português;
 *  4. esqueci a senha esconde a senha e manda o link de volta para "/";
 *  5. botão desabilitado diz o motivo;
 *  6. criar conta troca o lado ativo (inert) e, sem sessão, volta a entrar com a mensagem.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const signUp = vi.fn();
vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
            resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
            signUp: (...a: unknown[]) => signUp(...a),
        },
    },
}));

import InvestorLogin from '../../components/portal/InvestorLogin';
import { loginFeitoNestaAba } from '../../lib/loginNestaAba';

const EMAIL = 'investidor@exemplo.com.br';
const ladoEntrar = () => within(screen.getByTestId('lado-entrar'));
const ladoCadastro = () => within(screen.getByTestId('lado-cadastro'));

describe('InvestorLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    it('1. identidade, voltar para portais e só o lado entrar ativo', async () => {
        const onBack = vi.fn();
        const user = userEvent.setup();
        render(<InvestorLogin onBack={onBack} />);

        expect(screen.getByRole('heading', { level: 1, name: 'Portal do Investidor' })).toBeInTheDocument();
        expect(screen.getByTestId('lado-entrar')).not.toHaveAttribute('inert');
        expect(screen.getByTestId('lado-cadastro')).toHaveAttribute('inert');

        await user.click(screen.getByRole('button', { name: 'Voltar para Portais' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('2. entrar marca o login nesta aba ANTES do signIn, com e-mail normalizado e senha', async () => {
        let marcadoAoChamar = false;
        signInWithPassword.mockImplementation(async () => {
            marcadoAoChamar = loginFeitoNestaAba(EMAIL);
            return { error: null };
        });
        const user = userEvent.setup();
        render(<InvestorLogin />);

        await user.type(ladoEntrar().getByLabelText('E-mail'), '  Investidor@Exemplo.com.br ');
        await user.type(ladoEntrar().getByLabelText('Senha'), 'Senha123');
        await user.click(ladoEntrar().getByRole('button', { name: 'Entrar' }));

        await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'Senha123' }));
        expect(marcadoAoChamar).toBe(true);
    });

    it('3. erro do Supabase vira mensagem em português', async () => {
        signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
        const user = userEvent.setup();
        render(<InvestorLogin />);

        await user.type(ladoEntrar().getByLabelText('E-mail'), EMAIL);
        await user.type(ladoEntrar().getByLabelText('Senha'), 'errada');
        await user.click(ladoEntrar().getByRole('button', { name: 'Entrar' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    });

    it('4. esqueci a senha: sem campo de senha, redirectTo volta para a raiz', async () => {
        resetPasswordForEmail.mockResolvedValue({ error: null });
        const user = userEvent.setup();
        render(<InvestorLogin />);

        await user.click(ladoEntrar().getByRole('button', { name: 'Esqueci minha senha' }));
        expect(ladoEntrar().queryByLabelText('Senha')).toBeNull();
        expect(ladoEntrar().getByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument();

        await user.type(ladoEntrar().getByLabelText('E-mail'), EMAIL);
        await user.click(ladoEntrar().getByRole('button', { name: 'Enviar instruções' }));

        await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
            EMAIL,
            { redirectTo: `${window.location.origin}/` },
        ));
        expect(await screen.findByRole('status')).toHaveTextContent(/enviamos as instruções/);

        await user.click(ladoEntrar().getByRole('button', { name: 'Voltar para entrar' }));
        expect(ladoEntrar().getByLabelText('Senha')).toBeInTheDocument();
    });

    it('5. botão desabilitado diz o motivo', () => {
        render(<InvestorLogin />);
        expect(ladoEntrar().getByRole('button', { name: 'Entrar' })).toBeDisabled();
        expect(ladoEntrar().getByText('Informe e-mail e senha para entrar.')).toBeInTheDocument();
    });

    it('6. criar conta: troca o lado ativo; signUp e, sem sessão, volta a entrar com a mensagem', async () => {
        signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
        const user = userEvent.setup();
        render(<InvestorLogin />);

        await user.click(ladoEntrar().getByRole('button', { name: 'Criar conta' }));
        expect(screen.getByTestId('lado-entrar')).toHaveAttribute('inert');
        expect(screen.getByTestId('lado-cadastro')).not.toHaveAttribute('inert');
        // O lado que sai mantém o próprio rótulo durante a varredura.
        expect(ladoEntrar().getByRole('button', { name: 'Entrar' })).toBeInTheDocument();

        await user.type(ladoCadastro().getByLabelText('E-mail'), EMAIL);
        await user.type(ladoCadastro().getByLabelText('Escolha uma senha'), '123');
        expect(ladoCadastro().getByRole('button', { name: 'Criar conta' })).toBeDisabled();
        expect(ladoCadastro().getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeInTheDocument();
        await user.type(ladoCadastro().getByLabelText('Escolha uma senha'), '456');
        await user.click(ladoCadastro().getByRole('button', { name: 'Criar conta' }));

        await waitFor(() => expect(signUp).toHaveBeenCalledWith({
            email: EMAIL,
            password: '123456',
            options: { emailRedirectTo: `${window.location.origin}/` },
        }));
        expect(await screen.findByRole('status')).toHaveTextContent(/Conta criada/);
        expect(screen.getByTestId('lado-cadastro')).toHaveAttribute('inert');
        expect(loginFeitoNestaAba(EMAIL)).toBe(true);
    });
});
