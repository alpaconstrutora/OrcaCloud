// @vitest-environment jsdom
/**
 * Portal do Colaborador — estados de leitura e holerite pelo link
 * (docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md).
 *
 * Antes: cada aba lia só `data` (default `[]`), então carregando ou falhando a
 * tela dizia "Nenhum holerite disponível"; e o recibo lia seis tabelas direto,
 * o que pelo link (`anon`) voltava vazio e mostrava "getRun: …".
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

const getPortalSummary = vi.fn();
const getPortalPaystub = vi.fn();
vi.mock('../../services/atsService', () => ({
    atsService: {
        getPortalSummary: (...a: unknown[]) => getPortalSummary(...a),
        getPortalPaystub: (...a: unknown[]) => getPortalPaystub(...a),
    },
}));

// Pelo link, o recibo NÃO pode passar pelas leituras diretas do app.
const getRun = vi.fn();
vi.mock('../../services/payrollService', () => ({
    payrollService: {
        getRun: (...a: unknown[]) => getRun(...a),
        getPayrollResult: vi.fn(), getEmployeeItems: vi.fn(), listRubrics: vi.fn(),
        listEvents: vi.fn(), getOrganizacaoDoHolerite: vi.fn(),
    },
}));

vi.mock('../../services/academyPortalService', () => ({ academyPortalService: { listEnrollments: vi.fn().mockResolvedValue([]) } }));

import { PortalView } from '../../components/LaborPortal';

const TOKEN = 'tok-claudinei';
const resumo = {
    employee: { id: 'emp-1', name: 'Claudinei da Costa Vieira', role: 'Mestre de Obras', status: 'ATIVO', hire_date: '2024-10-16' },
    ferias_saldo: 30, pontos_pendentes: 0, treinamentos_vencendo: 0, ausencias_mes: 0,
};
const folhaOut = { id: 'run-out', start_date: '2026-10-01', end_date: '2026-10-31', type: 'mensal', status: 'FECHADO', net: 2450.5 };

const montar = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PortalView employeeId="emp-1" orgId="org-alpa" portalToken={TOKEN} onLogout={() => {}} />
    </QueryClientProvider>,
);

const abrirAba = async (nome: RegExp) => {
    await screen.findByText('Claudinei da Costa Vieira');
    fireEvent.click(screen.getByRole('button', { name: nome }));
};

beforeEach(() => {
    rpc.mockReset(); invoke.mockReset(); getRun.mockReset();
    getPortalSummary.mockReset().mockResolvedValue(resumo);
    getPortalPaystub.mockReset();
});

describe('Portal do Colaborador — resumo', () => {
    it('resumo que falha mostra tela de erro com "Tentar de novo", e não zeros', async () => {
        getPortalSummary.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(resumo);
        montar();
        expect(await screen.findByText('Não foi possível abrir o seu portal')).toBeTruthy();
        expect(screen.getByText(/sem conexão/i)).toBeTruthy();
        expect(screen.queryByText('Saldo de férias')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
        expect(await screen.findByText('Claudinei da Costa Vieira')).toBeTruthy();
    });
});

describe('Portal do Colaborador — aba Folha', () => {
    it('falha na leitura NÃO aparece como "nenhum holerite"; "Tentar de novo" recarrega', async () => {
        let falhar = true;
        rpc.mockImplementation(async (fn: string) => {
            if (fn !== 'fn_colab_portal_payroll_runs') return { data: [], error: null };
            return falhar ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : { data: [folhaOut], error: null };
        });
        montar();
        await abrirAba(/holerites/i);

        expect(await screen.findByText('Não foi possível carregar seus holerites')).toBeTruthy();
        expect(screen.queryByText('Nenhum holerite disponível')).toBeNull();
        expect(screen.queryByText(/statement timeout/)).toBeNull();

        falhar = false;
        fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
        expect(await screen.findByText('Outubro de 2026')).toBeTruthy();
    });

    it('enquanto carrega diz "Carregando", e vazio de verdade orienta', async () => {
        let soltar: (v: unknown) => void = () => {};
        rpc.mockImplementation((fn: string) => fn === 'fn_colab_portal_payroll_runs'
            ? new Promise(r => { soltar = r; })
            : Promise.resolve({ data: [], error: null }));
        montar();
        await abrirAba(/holerites/i);

        expect(await screen.findByText('Carregando seus holerites...')).toBeTruthy();
        expect(screen.queryByText('Nenhum holerite disponível')).toBeNull();

        soltar({ data: [], error: null });
        expect(await screen.findByText('Nenhum holerite disponível')).toBeTruthy();
        expect(screen.getByText(/quando o RH fecha a folha/)).toBeTruthy();
    });

    it('holerite pelo link vem da RPC por token, nunca das tabelas da folha', async () => {
        rpc.mockResolvedValue({ data: [folhaOut], error: null });
        getPortalPaystub.mockResolvedValue({
            run: folhaOut,
            result: { id: 'r1', payroll_run_id: 'run-out', employee_id: 'emp-1', gross: 3000, discounts: 549.5, net: 2450.5,
                employee: { name: 'Claudinei da Costa Vieira', cpf: '000.000.000-00', role: 'Mestre de Obras', base_salary: 3000 } },
            items: [{ code: 'SALARIO', type: 'provento', amount: 3000 }],
            rubrics: [{ code: 'SALARIO', name: 'Salário Base', type: 'provento' }],
            events: [],
            organization: { name: 'Alpa Construtora e Incorporadora', cnpj: '00.000.000/0001-00', address: null, settings: { tipo_pessoa: 'PJ' } },
        });
        montar();
        await abrirAba(/holerites/i);
        fireEvent.click(await screen.findByText('Outubro de 2026'));

        expect(await screen.findByText('Recibo de Pagamento')).toBeTruthy();
        expect(getPortalPaystub).toHaveBeenCalledWith(TOKEN, 'run-out');
        expect(getRun).not.toHaveBeenCalled();
    });

    it('holerite que falha pelo link mostra frase do colaborador e "Tentar de novo", não "getRun: …"', async () => {
        rpc.mockResolvedValue({ data: [folhaOut], error: null });
        getPortalPaystub.mockRejectedValue({ code: 'P0001', message: 'PORTAL_TOKEN_INVALIDO' });
        montar();
        await abrirAba(/holerites/i);
        fireEvent.click(await screen.findByText('Outubro de 2026'));

        expect(await screen.findByText('Não foi possível abrir o holerite')).toBeTruthy();
        expect(screen.getByText(/link do portal expirou/i)).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /tentar de novo/i }).length).toBeGreaterThan(0);
    });
});

describe('Portal do Colaborador — download de documento', () => {
    it('erro no download aparece na aba (sem alert) e libera o botão', async () => {
        const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const janela = { close: vi.fn(), location: { href: '' } };
        vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
        rpc.mockImplementation(async (fn: string) => fn === 'fn_colab_portal_ged_documents'
            ? { data: [{ id: 'd1', nome: 'ASO admissional', categoria: 'Saúde', storage_path: 'ged/aso.pdf' }], error: null }
            : { data: [], error: null });
        invoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') });

        montar();
        await abrirAba(/documentos/i);
        const baixar = await screen.findByRole('button', { name: 'Baixar ASO admissional' });
        fireEvent.click(baixar);

        expect(await screen.findByText('Não foi possível baixar "ASO admissional"')).toBeTruthy();
        expect(alerta).not.toHaveBeenCalled();
        expect(janela.close).toHaveBeenCalled();
        await waitFor(() => expect((baixar as HTMLButtonElement).disabled).toBe(false));
    });
});
