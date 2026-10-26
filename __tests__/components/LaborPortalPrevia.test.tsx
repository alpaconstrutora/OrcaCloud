// @vitest-environment jsdom
/**
 * Portal do Colaborador — prévia do RH honesta
 * (docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md, item 2).
 *
 * Antes: duas prévias. A aba "Prévia do Portal" abria o portal SEM token (lia
 * por employee_id com a sessão do admin, Academia sumia) e trocava a página
 * inteira, com o "sair" como única saída. O ícone da tabela abria outro modal,
 * com token. Nenhuma das duas dizia que era prévia.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn() } } }));

const getPortalSummary = vi.fn();
const listPortalTokens = vi.fn();
vi.mock('../../services/atsService', () => ({
    atsService: {
        getPortalSummary: (...a: unknown[]) => getPortalSummary(...a),
        listPortalTokens: (...a: unknown[]) => listPortalTokens(...a),
        getPortalPaystub: vi.fn(),
        generatePortalToken: vi.fn(),
        revokePortalToken: vi.fn(),
    },
}));

const listEnrollments = vi.fn();
vi.mock('../../services/academyPortalService', () => ({ academyPortalService: { listEnrollments: (...a: unknown[]) => listEnrollments(...a) } }));

import LaborPortal, { PortalView } from '../../components/LaborPortal';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { Employee } from '../../services/laborService';

const emp = (id: string, name: string, role: string) => ({ id, name, role, status: 'ATIVO' }) as unknown as Employee;
const CLAUDINEI = emp('emp-1', 'Claudinei da Costa Vieira', 'Mestre de Obras');
const ROGERIO = emp('emp-2', 'Rogério Alves', 'Pedreiro');
const MARIA = emp('emp-3', 'Maria Souza', 'Servente');

const futuro = new Date(Date.now() + 10 * 86400000).toISOString();
const passado = new Date(Date.now() - 10 * 86400000).toISOString();
const tokens = [
    { id: 't1', org_id: 'org-alpa', employee_id: 'emp-1', token: 'tok-claudinei', expires_at: futuro, is_active: true },
    { id: 't3', org_id: 'org-alpa', employee_id: 'emp-3', token: 'tok-maria', expires_at: passado, is_active: true },
];

const resumo = (nome: string) => ({
    employee: { id: 'emp-1', name: nome, role: 'Mestre de Obras', status: 'ATIVO' },
    ferias_saldo: 30, pontos_pendentes: 0, treinamentos_vencendo: 0, ausencias_mes: 0,
});

const novoClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const montarLaborPortal = (employees: Employee[] = [CLAUDINEI, ROGERIO, MARIA]) => render(
    <QueryClientProvider client={novoClient()}>
        <ConfirmProvider>
            <LaborPortal orgId="org-alpa" employees={employees} />
        </ConfirmProvider>
    </QueryClientProvider>,
);

/** O MobilePreviewFrame renderiza o portal DENTRO do iframe (viewport de celular de verdade). */
const dentroDaPrevia = async () => {
    const iframe = await screen.findByTitle(/Prévia do Portal do Colaborador/) as HTMLIFrameElement;
    const corpo = await waitFor(() => {
        const b = iframe.contentDocument?.body;
        if (!b || !b.textContent) throw new Error('prévia ainda vazia');
        return b;
    });
    return within(corpo);
};

beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
    getPortalSummary.mockReset().mockResolvedValue(resumo('Claudinei da Costa Vieira'));
    listPortalTokens.mockReset().mockResolvedValue(tokens);
    listEnrollments.mockReset().mockResolvedValue([]);
});

describe('PortalView em prévia', () => {
    const montar = () => render(
        <QueryClientProvider client={novoClient()}>
            <PortalView employeeId="emp-1" orgId="org-alpa" portalToken="tok-claudinei" previa={{ nome: 'Claudinei da Costa Vieira' }} />
        </QueryClientProvider>,
    );

    it('diz que é prévia e de quem, e não oferece "sair do portal"', async () => {
        montar();
        const faixa = await screen.findByRole('note');
        expect(faixa.textContent).toBe('Prévia · vendo como Claudinei da Costa Vieira');
        await screen.findByText('Dias de Férias');
        expect(screen.queryByRole('button', { name: 'Sair do portal' })).toBeNull();
    });

    it('a faixa aparece já enquanto carrega', () => {
        getPortalSummary.mockReturnValue(new Promise(() => {}));
        montar();
        expect(screen.getByRole('note').textContent).toContain('vendo como Claudinei');
    });

    it('cursos da Academia não abrem na prévia (gravariam progresso em nome do colaborador)', async () => {
        listEnrollments.mockResolvedValue([{ id: 'm1', curso: 'NR-35 Trabalho em Altura', nr_referencia: 'NR-35', versao: 1, status: 'NAO_INICIADO', percentual: 0, data_limite: null }]);
        montar();
        await screen.findByText('Dias de Férias');
        fireEvent.click(screen.getByRole('button', { name: /trein/i }));

        const curso = (await screen.findByText('NR-35 Trabalho em Altura')).closest('button') as HTMLButtonElement;
        expect(curso.disabled).toBe(true);
        expect(screen.getByText(/registraria progresso em nome de Claudinei da Costa Vieira/)).toBeTruthy();
        expect(within(curso).getByText('Não abre na prévia')).toBeTruthy();
        expect(listEnrollments).toHaveBeenCalledWith('tok-claudinei');
    });

    it('fora da prévia, sem faixa e com "sair"', async () => {
        render(
            <QueryClientProvider client={novoClient()}>
                <PortalView employeeId="emp-1" orgId="org-alpa" portalToken="tok-claudinei" onLogout={() => {}} />
            </QueryClientProvider>,
        );
        await screen.findByText('Dias de Férias');
        expect(screen.queryByRole('note')).toBeNull();
        expect(screen.getByRole('button', { name: 'Sair do portal' })).toBeTruthy();
    });
});

describe('Aba "Prévia do Portal"', () => {
    const abrirAba = () => fireEvent.click(screen.getByRole('tab', { name: /prévia do portal/i }));

    it('só deixa escolher quem tem link ativo e diz por que os outros não', async () => {
        montarLaborPortal();
        abrirAba();
        const select = await screen.findByLabelText('Ver o portal como') as HTMLSelectElement;
        await waitFor(() => expect(select.disabled).toBe(false));

        const opcao = (texto: RegExp) => within(select).getByRole('option', { name: texto }) as HTMLOptionElement;
        expect(opcao(/Claudinei/).disabled).toBe(false);
        expect(opcao(/Rogério Alves — sem link/).disabled).toBe(true);
        expect(opcao(/Maria Souza — link expirado/).disabled).toBe(true);
        expect(select.querySelector('optgroup[label^="Sem link ativo"]')).toBeTruthy();
    });

    it('escolher abre a prévia no celular, pelo token, com a faixa', async () => {
        montarLaborPortal();
        abrirAba();
        const select = await screen.findByLabelText('Ver o portal como') as HTMLSelectElement;
        await waitFor(() => expect(select.disabled).toBe(false));
        fireEvent.change(select, { target: { value: 'emp-1' } });

        const previa = await dentroDaPrevia();
        expect((await previa.findByRole('note')).textContent).toContain('vendo como Claudinei da Costa Vieira');
        expect(getPortalSummary).toHaveBeenCalledWith('emp-1', 'tok-claudinei');
        // A aba continua no lugar: a prévia não troca mais a página inteira.
        expect(screen.getByRole('heading', { name: 'Prévia do portal' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /fechar prévia/i }));
        await waitFor(() => expect(screen.queryByTitle(/Prévia do Portal do Colaborador/)).toBeNull());
    });

    it('ninguém com link: diz o que fazer e leva à Gestão de Acessos', async () => {
        listPortalTokens.mockResolvedValue([]);
        montarLaborPortal();
        abrirAba();
        expect(await screen.findByText(/Nenhum colaborador tem link ativo/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /ir para gestão de acessos/i }));
        expect(await screen.findByRole('heading', { name: 'Portal do Colaborador' })).toBeTruthy();
    });
});

describe('Ícone de prévia na Gestão de Acessos', () => {
    it('abre a MESMA prévia (moldura de celular, token, faixa)', async () => {
        montarLaborPortal([CLAUDINEI]);
        const icone = await screen.findByTitle('Prévia do portal — ver como este colaborador');
        fireEvent.click(icone);

        const previa = await dentroDaPrevia();
        expect((await previa.findByRole('note')).textContent).toContain('vendo como Claudinei da Costa Vieira');
        expect(getPortalSummary).toHaveBeenCalledWith('emp-1', 'tok-claudinei');
    });
});
