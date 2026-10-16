// @vitest-environment jsdom
/**
 * Página de login exclusiva do Portal de Treinamentos (pedido de 16/10/2026).
 *
 * Até então /portal-treinamentos abria o `Auth` genérico, com "Voltar para
 * Portais", "Cadastre-se" e um "esqueci a senha" que devolvia à raiz. Trava:
 *  1. identidade própria, sem cadastro nem voltar para portais; rodapé do RH;
 *  2. entrar marca o login NESTA aba antes de chamar o Supabase, com e-mail
 *     minúsculo/sem espaços e a senha;
 *  3. erro do Supabase aparece em português;
 *  4. esqueci a senha esconde a senha e manda o link de volta para /portal-treinamentos;
 *  5. botão desabilitado diz o motivo.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
            resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
        },
    },
}));

import TrainingLogin, { mensagemDeErroDeLogin } from '../../components/training/TrainingLogin';
import { loginFeitoNestaAba } from '../../lib/loginNestaAba';

const EMAIL = 'treinando@empreiteira.com.br';

describe('TrainingLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    it('1. identidade própria, sem cadastro nem voltar para portais', () => {
        render(<TrainingLogin />);
        expect(screen.getAllByText('Portal de Treinamentos').length).toBeGreaterThan(0);
        expect(screen.queryByText(/Cadastre-se/)).toBeNull();
        expect(screen.queryByText(/Criar Minha Conta/)).toBeNull();
        expect(screen.queryByText(/Voltar para Portais/)).toBeNull();
        expect(screen.getByText(/Fale com o RH da sua empresa/)).toBeInTheDocument();
    });

    it('2. entrar marca o login nesta aba ANTES do signIn, com e-mail normalizado e senha', async () => {
        let marcadoAoChamar = false;
        signInWithPassword.mockImplementation(async () => {
            marcadoAoChamar = loginFeitoNestaAba(EMAIL);
            return { error: null };
        });
        const user = userEvent.setup();
        render(<TrainingLogin />);

        await user.type(screen.getByLabelText('E-mail'), '  Treinando@Empreiteira.com.br ');
        await user.type(screen.getByLabelText('Senha'), 'Senha123');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'Senha123' }));
        expect(marcadoAoChamar).toBe(true);
    });

    it('3. erro do Supabase vira mensagem em português', async () => {
        signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
        const user = userEvent.setup();
        render(<TrainingLogin />);

        await user.type(screen.getByLabelText('E-mail'), EMAIL);
        await user.type(screen.getByLabelText('Senha'), 'errada');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
        expect(mensagemDeErroDeLogin({ message: 'Email not confirmed' })).toMatch(/não confirmou o convite/);
        expect(mensagemDeErroDeLogin({ message: 'Request rate limit reached' })).toMatch(/Muitas tentativas/);
        expect(mensagemDeErroDeLogin({ message: 'Failed to fetch' })).toMatch(/Sem conexão/);
        expect(mensagemDeErroDeLogin(null)).toBe('Não foi possível entrar. Tente de novo.');
    });

    it('4. esqueci a senha: sem campo de senha, redirectTo termina em /portal-treinamentos', async () => {
        resetPasswordForEmail.mockResolvedValue({ error: null });
        const user = userEvent.setup();
        render(<TrainingLogin />);

        await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
        expect(screen.queryByLabelText('Senha')).toBeNull();

        await user.type(screen.getByLabelText('E-mail'), EMAIL);
        await user.click(screen.getByRole('button', { name: 'Enviar instruções' }));

        await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
            EMAIL,
            { redirectTo: expect.stringMatching(/\/portal-treinamentos$/) },
        ));
        expect(await screen.findByRole('status')).toHaveTextContent(/enviamos as instruções/);

        await user.click(screen.getByRole('button', { name: 'Voltar para entrar' }));
        expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    });

    it('5. botão desabilitado diz o motivo', () => {
        render(<TrainingLogin />);
        expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
        expect(screen.getByText('Informe e-mail e senha para entrar.')).toBeInTheDocument();
    });
});
