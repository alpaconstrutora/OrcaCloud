// @vitest-environment jsdom
/**
 * Página de login exclusiva dos portais (16/10/2026) — `PortalLogin` com a
 * `EntradaDoPortal` de cada um. Trava:
 *  1. identidade da entrada (título do cartão), sem "Cadastre-se" do Auth nem
 *     "Voltar para Portais"; rodapé da entrada;
 *  2. entrar marca o login NESTA aba antes do signIn, com e-mail minúsculo/sem
 *     espaços e a senha;
 *  3. erro do Supabase aparece em português;
 *  4. esqueci a senha esconde a senha e manda o link de volta para a ROTA do portal;
 *  5. botão desabilitado diz o motivo;
 *  6. "Primeiro acesso" só onde a entrada permite (Cliente sim, Treinamentos não);
 *  7. primeiro acesso chama signUp com emailRedirectTo na rota do portal e, sem
 *     sessão (confirmação de e-mail ligada), volta ao modo entrar com a mensagem.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

import PortalLogin, { mensagemDeErroDeLogin, mensagemDeErroDePrimeiroAcesso } from '../../components/portal/PortalLogin';
import { ENTRADAS_DO_PORTAL } from '../../lib/entradasDoPortal';
import { loginFeitoNestaAba } from '../../lib/loginNestaAba';
import { ProfileGroup } from '../../types';

const CLIENTE = ENTRADAS_DO_PORTAL[ProfileGroup.CLIENT]!;
const TREINANDO = ENTRADAS_DO_PORTAL[ProfileGroup.TRAINEE]!;
const EMAIL = 'cliente@exemplo.com.br';

describe('PortalLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    it('1. identidade da entrada, sem cadastro do Auth nem voltar para portais', () => {
        render(<PortalLogin entrada={CLIENTE} />);
        expect(screen.getAllByText('Portal do Cliente').length).toBeGreaterThan(0);
        expect(screen.queryByText(/Cadastre-se/)).toBeNull();
        expect(screen.queryByText(/Criar Minha Conta/)).toBeNull();
        expect(screen.queryByText(/Voltar para Portais/)).toBeNull();
        expect(screen.getByText(CLIENTE.rodape)).toBeInTheDocument();
    });

    it('2. entrar marca o login nesta aba ANTES do signIn, com e-mail normalizado e senha', async () => {
        let marcadoAoChamar = false;
        signInWithPassword.mockImplementation(async () => {
            marcadoAoChamar = loginFeitoNestaAba(EMAIL);
            return { error: null };
        });
        const user = userEvent.setup();
        render(<PortalLogin entrada={CLIENTE} />);

        await user.type(screen.getByLabelText('E-mail'), '  Cliente@Exemplo.com.br ');
        await user.type(screen.getByLabelText('Senha'), 'Senha123');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'Senha123' }));
        expect(marcadoAoChamar).toBe(true);
    });

    it('3. erro do Supabase vira mensagem em português', async () => {
        signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
        const user = userEvent.setup();
        render(<PortalLogin entrada={CLIENTE} />);

        await user.type(screen.getByLabelText('E-mail'), EMAIL);
        await user.type(screen.getByLabelText('Senha'), 'errada');
        await user.click(screen.getByRole('button', { name: 'Entrar' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
        expect(mensagemDeErroDeLogin({ message: 'Email not confirmed' })).toMatch(/não foi confirmado/);
        expect(mensagemDeErroDeLogin({ message: 'Request rate limit reached' })).toMatch(/Muitas tentativas/);
        expect(mensagemDeErroDeLogin({ message: 'Failed to fetch' })).toMatch(/Sem conexão/);
        expect(mensagemDeErroDeLogin(null)).toBe('Não foi possível entrar. Tente de novo.');
        expect(mensagemDeErroDePrimeiroAcesso({ message: 'User already registered' })).toMatch(/já tem conta/);
    });

    it('4. esqueci a senha: sem campo de senha, redirectTo é a rota do portal', async () => {
        resetPasswordForEmail.mockResolvedValue({ error: null });
        const user = userEvent.setup();
        render(<PortalLogin entrada={CLIENTE} />);

        await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
        expect(screen.queryByLabelText('Senha')).toBeNull();

        await user.type(screen.getByLabelText('E-mail'), EMAIL);
        await user.click(screen.getByRole('button', { name: 'Enviar instruções' }));

        await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
            EMAIL,
            { redirectTo: expect.stringMatching(/\/portal-cliente$/) },
        ));
        expect(await screen.findByRole('status')).toHaveTextContent(/enviamos as instruções/);

        await user.click(screen.getByRole('button', { name: 'Voltar para entrar' }));
        expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    });

    it('5. botão desabilitado diz o motivo', () => {
        render(<PortalLogin entrada={CLIENTE} />);
        expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
        expect(screen.getByText('Informe e-mail e senha para entrar.')).toBeInTheDocument();
    });

    it('6. "Primeiro acesso" só onde a entrada permite', () => {
        const { unmount } = render(<PortalLogin entrada={CLIENTE} />);
        expect(screen.getByRole('button', { name: 'Crie sua senha' })).toBeInTheDocument();
        unmount();
        render(<PortalLogin entrada={TREINANDO} />);
        expect(screen.queryByRole('button', { name: 'Crie sua senha' })).toBeNull();
        expect(screen.getByText(/Fale com o RH da sua empresa/)).toBeInTheDocument();
    });

    it('7. primeiro acesso: signUp com emailRedirectTo na rota; sem sessão, volta a entrar com a mensagem', async () => {
        signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
        const user = userEvent.setup();
        render(<PortalLogin entrada={CLIENTE} />);

        await user.click(screen.getByRole('button', { name: 'Crie sua senha' }));
        expect(screen.getByRole('heading', { name: 'Primeiro acesso' })).toBeInTheDocument();
        await user.type(screen.getByLabelText('E-mail'), EMAIL);
        await user.type(screen.getByLabelText('Escolha uma senha'), '123');
        expect(screen.getByRole('button', { name: 'Criar senha e entrar' })).toBeDisabled();
        expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Escolha uma senha'), '456');
        await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

        await waitFor(() => expect(signUp).toHaveBeenCalledWith({
            email: EMAIL,
            password: '123456',
            options: { emailRedirectTo: expect.stringMatching(/\/portal-cliente$/) },
        }));
        expect(await screen.findByRole('status')).toHaveTextContent(/Conta criada/);
        expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
        expect(loginFeitoNestaAba(EMAIL)).toBe(true);
    });
});
