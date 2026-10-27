// @vitest-environment jsdom
/**
 * Portal do Colaborador — marca da empresa, holerite como tela inicial, valor
 * escondido e rodapé (docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md, item 4).
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn() } } }));

const getPortalSummary = vi.fn();
vi.mock('../../services/atsService', () => ({
    atsService: { getPortalSummary: (...a: unknown[]) => getPortalSummary(...a), getPortalPaystub: vi.fn() },
}));
vi.mock('../../services/academyPortalService', () => ({ academyPortalService: { listEnrollments: vi.fn().mockResolvedValue([]) } }));

import { PortalView } from '../../components/LaborPortal';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const resumo = (organization: unknown, extra: Record<string, unknown> = {}) => ({
    employee: { id: 'emp-1', name: 'Claudinei da Costa Vieira', role: 'Mestre de Obras', status: 'ATIVO', hire_date: '2024-10-16' },
    ferias_saldo: 30, pontos_pendentes: 0, treinamentos_vencendo: 0, ausencias_mes: 0, organization, ...extra,
});
const HOLERITES = [
    { id: 'r3', start_date: '2026-09-01', end_date: '2026-09-30', type: 'mensal', status: 'FECHADO', net: 3450.5 },
    { id: 'r1', start_date: '2026-08-01', end_date: '2026-08-31', type: 'mensal', status: 'FECHADO', net: 3398.12 },
];

const montar = (props: Partial<React.ComponentProps<typeof PortalView>> = {}) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PortalView employeeId="emp-1" orgId={null} portalToken="tok" onLogout={() => {}} {...props} />
    </QueryClientProvider>,
);

beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* jsdom */ }
    rpc.mockReset().mockImplementation(async (fn: string) => ({ data: fn === 'fn_colab_portal_payroll_runs' ? HOLERITES : [], error: null }));
    getPortalSummary.mockReset().mockResolvedValue(resumo({ name: 'Alpa Construtora e Incorporadora', logo_url: LOGO }));
});

describe('Marca da empresa no cabeçalho', () => {
    it('mostra o logo da organização do colaborador, com o nome dela como texto alternativo', async () => {
        montar();
        const logo = await screen.findByRole('img', { name: 'Alpa Construtora e Incorporadora' });
        expect(logo.getAttribute('src')).toBe(LOGO);
        expect(screen.getByText('Mestre de Obras · desde 16/10/2024')).toBeTruthy();
    });

    it('sem logo cadastrado, o nome da empresa aparece em texto', async () => {
        getPortalSummary.mockResolvedValue(resumo({ name: 'Construção do Edifício Garden Cambuhy SPE', logo_url: null }));
        montar();
        expect(await screen.findByText('Construção do Edifício Garden Cambuhy SPE')).toBeTruthy();
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('logo que não carrega cai para o nome', async () => {
        montar();
        fireEvent.error(await screen.findByRole('img', { name: 'Alpa Construtora e Incorporadora' }));
        expect(await screen.findByText('Alpa Construtora e Incorporadora')).toBeTruthy();
    });
});

describe('Holerites é a tela inicial', () => {
    it('abre no último holerite, com o valor escondido e fora da tela', async () => {
        montar();
        // Um título só ("Último holerite · {mês}"), sem rótulo-kicker acima.
        const titulo = await screen.findByRole('heading', { name: 'Último holerite · Setembro de 2026' });
        const cartao = titulo.closest('section') as HTMLElement;
        expect(within(cartao).getByText('Valor escondido')).toBeTruthy();
        // Escondido não é desfocado: o valor nem chega ao DOM.
        expect(document.body.textContent).not.toMatch(/3\.450,50/);
        expect(screen.getByText('Anteriores')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Holerites/ }).getAttribute('aria-current')).toBe('page');
    });

    it('o olho mostra todos os valores e o aparelho lembra', async () => {
        const { unmount } = montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Mostrar valores' }));
        expect(await screen.findByText(/3\.450,50/)).toBeTruthy();
        expect(screen.getByText(/3\.398,12/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Esconder valores' }).getAttribute('aria-pressed')).toBe('true');
        unmount();

        montar();
        expect(await screen.findByRole('button', { name: 'Esconder valores' })).toBeTruthy();
        expect(screen.getByText(/3\.450,50/)).toBeTruthy();
    });
});

describe('Indicadores moram nas abas; o rodapé avisa', () => {
    it('pontos em análise e treinamento vencendo acendem aviso no rodapé e aparecem na aba', async () => {
        getPortalSummary.mockResolvedValue(resumo({ name: 'Alpa', logo_url: null }, { pontos_pendentes: 2, treinamentos_vencendo: 1 }));
        montar();
        const nav = await screen.findByRole('navigation', { name: 'Seções do portal' });
        expect(within(nav).getAllByRole('button')).toHaveLength(5);
        expect(within(nav).getByRole('button', { name: /Ponto.*2 em análise/ })).toBeTruthy();
        expect(within(nav).getByRole('button', { name: /Treinamentos.*1 vencendo/ })).toBeTruthy();

        fireEvent.click(within(nav).getByRole('button', { name: /^Ponto/ }));
        expect(await screen.findByText(/2 registros em análise/)).toBeTruthy();

        fireEvent.click(within(nav).getByRole('button', { name: /^Treinamentos/ }));
        expect(await screen.findByText(/1 treinamento vence em até 30 dias/)).toBeTruthy();
    });

    it('saldo de férias e ausências do mês ficam na aba Férias', async () => {
        getPortalSummary.mockResolvedValue(resumo({ name: 'Alpa', logo_url: null }, { ausencias_mes: 1 }));
        montar();
        fireEvent.click(within(await screen.findByRole('navigation', { name: 'Seções do portal' })).getByRole('button', { name: /^Férias/ }));
        expect(await screen.findByText('30 dias')).toBeTruthy();
        expect(screen.getByText(/Você tem/).textContent).toBe('Você tem 30 dias de férias para tirar.');
        expect(screen.getByText('1 ausência aprovada neste mês.')).toBeTruthy();
    });
});

describe('Sair', () => {
    it('pelo link há "Sair"; na prévia, não', async () => {
        const onLogout = vi.fn();
        const { unmount } = montar({ onLogout });
        fireEvent.click(await screen.findByRole('button', { name: 'Sair do portal' }));
        expect(onLogout).toHaveBeenCalled();
        unmount();

        montar({ previa: { nome: 'Claudinei da Costa Vieira', onSair: vi.fn() } });
        await waitFor(() => expect(screen.getByRole('navigation', { name: 'Seções do portal' })).toBeTruthy());
        expect(screen.queryByRole('button', { name: 'Sair do portal' })).toBeNull();
    });
});
