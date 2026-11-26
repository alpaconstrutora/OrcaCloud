// @vitest-environment jsdom
/**
 * Portal do Síndico › Financeiro — quem decide "logado" é a casca (SindicoPortal), com a
 * MESMA regra da aba Assembleias (fix 1 da revisão da B2, onda final da fase B):
 * entrada por e-mail e senha (`onLogout`) OU sessão ativa com o portal aberto pelo link
 * do convite OU a administradora pelo app. Antes era só `!!onLogout || comoAdministradora`:
 * a síndica já logada que abria o link ficava sem lançar/pagar.
 *
 * As outras abas (Avisos, Chamados, Unidades) não dependem de login — gravam pelo token
 * (RPCs com GRANT para anon); a Prestação de contas (rateios) mora dentro do Financeiro e
 * herda o mesmo `logado` (motivoBase).
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({
    rpc: vi.fn(),
    invoke: vi.fn(),
    sessao: null as null | { user: { id: string } },
    ouvintes: [] as ((evento: string, sessao: unknown) => void)[],
}));
vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: sb.rpc,
        functions: { invoke: sb.invoke },
        from: vi.fn(() => { throw new Error('o síndico não lê tabela'); }),
        auth: {
            getSession: async () => ({ data: { session: sb.sessao }, error: null }),
            onAuthStateChange: (f: (evento: string, sessao: unknown) => void) => {
                sb.ouvintes.push(f);
                return { data: { subscription: { unsubscribe: vi.fn() } } };
            },
        },
    },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import SindicoPortal from '../components/sindico/SindicoPortal';
import { MOTIVO_SEM_LOGIN } from '../utils/financeiroDoSindico';

const CONDOMINIO = {
    id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: '12345678000190', razaoSocial: 'Condomínio Galeria Altavista',
    cidade: 'Uberaba', mandatoInicio: null, mandatoFim: null,
};
const DADOS = {
    ok: true, sindico: { clientId: 's1', nome: 'Maria Síndica', email: 'maria@x.com' }, condominios: [CONDOMINIO],
    unidades: [], avisos: [], documentos: [], manutencao: [], ordens: [], ativos: [], rateios: [], chamados: [],
};
const FINANCEIRO = {
    ok: true, competencia: '2026-11-01', hoje: '2026-11-26', titulos: [],
    condominios: [{
        id: 'c1', nome: '010 - Galeria Altavista', codigo: '010', podeOperar: true, motivoNaoOpera: null,
        centros: [], categorias: [], planos: [], contas: [], fornecedores: [],
    }],
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sb.sessao = null;
    sb.ouvintes = [];
    sb.rpc.mockImplementation(async (fn: string) => {
        if (fn === 'sindico_portal_dados') return { data: DADOS, error: null };
        if (fn === 'sindico_portal_financeiro') return { data: FINANCEIRO, error: null };
        return { data: null, error: { message: `RPC inesperada: ${fn}` } };
    });
});

async function abrirFinanceiro() {
    await screen.findAllByText('010 - Galeria Altavista');
    fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
    return screen.findByRole('button', { name: /Lançar conta/ });
}

describe('SindicoPortal › aba Financeiro (casca decide "logado")', () => {
    it('só o link, sem sessão: Lançar conta desligado e diz por quê (como antes)', async () => {
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        const botao = await abrirFinanceiro();
        expect(botao).toBeDisabled();
        expect(botao.closest('span')).toHaveAttribute('title', MOTIVO_SEM_LOGIN);
    });

    it('link + sessão ativa: Financeiro operável (a síndica já logada que abriu o convite)', async () => {
        sb.sessao = { user: { id: 'u-sindica' } };
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await abrirFinanceiro();
        // A sessão chega depois do primeiro desenho (getSession é assíncrono).
        await waitFor(() => expect(screen.getByRole('button', { name: /Lançar conta/ })).toBeEnabled());
        expect(screen.getByRole('button', { name: /Lançar conta/ }).closest('span')).not.toHaveAttribute('title');
    });

    it('entrou na sessão com o portal aberto pelo link: o Financeiro acompanha', async () => {
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        expect(await abrirFinanceiro()).toBeDisabled();
        act(() => { for (const f of sb.ouvintes) f('SIGNED_IN', { user: { id: 'u-sindica' } }); });
        expect(screen.getByRole('button', { name: /Lançar conta/ })).toBeEnabled();
    });

    it('entrada por e-mail e senha (onLogout), mesmo sem sessão lida ainda: operável', async () => {
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => {}} /></ConfirmProvider>);
        expect(await abrirFinanceiro()).toBeEnabled();
    });

    it('administradora pelo app, sem sessão própria lida: continua operando', async () => {
        render(<ConfirmProvider><SindicoPortal clientId="s1" comoAdministradora embutido /></ConfirmProvider>);
        expect(await abrirFinanceiro()).toBeEnabled();
    });
});
