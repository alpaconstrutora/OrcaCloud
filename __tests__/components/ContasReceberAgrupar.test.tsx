// @vitest-environment jsdom
/**
 * Contas a Receber — "Agrupar", o mesmo recurso de Boletos a Pagar.
 * Pedido de 15/10/2026, docs/planos/2026-10-15-contas-receber-agrupar.md
 *
 * O que só aparece com a tela montada (a função pura está em recebivelGrupos.test.ts):
 * a linha de cabeçalho do grupo com contagem e total, recolher o grupo, e a seleção —
 * "selecionar todos" não pode marcar título escondido num grupo recolhido, mas o lote
 * continua valendo para o que já estava marcado antes de recolher.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Receivable } from '../../types/financial';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const linha = (over: Partial<Receivable>): Receivable => ({
    id: 'x', organization_id: 'org1', source_system: 'CONTRACT_PARCELADO', reference_id: null,
    transaction_date: null, due_date: '2026-10-10', amount: 100, direction: 'CREDIT',
    description: 'Parcela', category: null, status: 'PENDING', business_status: 'PREVISTO',
    effective_status: 'PREVISTO', party_id: null, party_name: 'Maria', party_type: 'CLIENT',
    project_id: null, project_name: null, cost_center_id: null, plano_de_contas_id: null,
    ...over,
} as Receivable);

const ROWS = [
    linha({ id: 'm1', party_name: 'Maria', amount: 100, description: 'Parcela M1' }),
    linha({ id: 'j1', party_name: 'João', amount: 250, description: 'Parcela J1' }),
    linha({ id: 'm2', party_name: 'Maria', amount: 50, description: 'Parcela M2' }),
    linha({ id: 's1', party_name: undefined, amount: 10, description: 'Parcela S1' }),
];

vi.mock('../../services/receivableService', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/receivableService')>();
    return {
        ...mod,
        receivableService: {
            list: vi.fn(async () => ROWS),
            getInadimplencia: vi.fn(async () => []),
            resolveTributos: vi.fn(async () => new Map()),
            resolveEmpreendimentos: vi.fn(async (d: Receivable[]) => d),
        },
    };
});
vi.mock('../../services/clientChargeService', () => ({ clientChargeService: { byTransaction: vi.fn(async () => ({})) } }));
vi.mock('../../services/asaasConfigService', () => ({ asaasConfigService: { get: vi.fn(async () => null) } }));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: { listCostCenters: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) },
}));
vi.mock('../../services/financialReceiptService', () => ({
    financialReceiptService: { listarAtivos: vi.fn(async () => new Map()), baixarPdf: vi.fn() },
}));
vi.mock('../../components/financeiro/BaixaRecebivelSheet', () => ({ default: () => null, tituloDeRecebivel: () => '' }));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ viewFocus: null, setViewFocus: () => {} }),
}));
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import ContasReceberManager from '../../components/ContasReceberManager';

const agruparPor = (valor: string) =>
    fireEvent.change(screen.getByTitle('Agrupar os títulos'), { target: { value: valor } });

/** Linha de cabeçalho do grupo — o `<div>` clicável com o rótulo. */
const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;

/** Rótulos dos grupos, na ordem da tela. */
const rotulosDosGrupos = () => Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);

describe('ContasReceberManager — Agrupar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    it('agrupa por cliente: cabeçalho com contagem e total bruto, grupos A→Z (Crescente); "Sem cliente" por último', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');

        agruparPor('cliente');

        const maria = cabecalho('Maria');
        expect(within(maria).getByText('2')).toBeTruthy();
        expect(within(maria).getByText(/150,00/)).toBeTruthy();
        expect(within(cabecalho('João')).getByText(/250,00/)).toBeTruthy();
        expect(rotulosDosGrupos()).toEqual(['João', 'Maria', 'Sem cliente']);
        // A escolha persiste, como os demais filtros da tela.
        expect(window.localStorage.getItem('contasReceberManagerFilters:groupBy')).toContain('cliente');
    });

    it('Crescente/Decrescente (molde ClickUp) inverte os grupos, persiste e mantém "Sem cliente" no fim', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        agruparPor('cliente');

        const ordem = screen.getByRole('combobox', { name: 'Ordem dos grupos' }) as HTMLSelectElement;
        expect(ordem.disabled).toBe(false);
        expect(ordem.value).toBe('asc');

        fireEvent.change(ordem, { target: { value: 'desc' } });
        expect(rotulosDosGrupos()).toEqual(['Maria', 'João', 'Sem cliente']);
        // Dentro do grupo, as linhas continuam na ordem da lista.
        const linhas = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.textContent ?? '');
        expect(linhas.findIndex(t => t.includes('Parcela M1'))).toBeLessThan(linhas.findIndex(t => t.includes('Parcela M2')));
        expect(window.localStorage.getItem('contasReceberManagerFilters:groupBy:direcao')).toContain('desc');

        fireEvent.change(ordem, { target: { value: 'asc' } });
        expect(rotulosDosGrupos()).toEqual(['João', 'Maria', 'Sem cliente']);
    });

    it('a ordem escolhida volta ao reabrir a tela', async () => {
        window.localStorage.setItem('contasReceberManagerFilters:groupBy', JSON.stringify('cliente'));
        window.localStorage.setItem('contasReceberManagerFilters:groupBy:direcao', JSON.stringify('desc'));
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        expect(rotulosDosGrupos()).toEqual(['Maria', 'João', 'Sem cliente']);
    });

    it('clicar no cabeçalho recolhe o grupo e "recolher todos" esconde todas as linhas', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        agruparPor('cliente');

        fireEvent.click(cabecalho('Maria'));
        expect(screen.queryByText('Parcela M1')).toBeNull();
        expect(screen.queryByText('Parcela M2')).toBeNull();
        expect(screen.getByText('Parcela J1')).toBeTruthy();

        fireEvent.click(screen.getByTitle('Expandir todos os grupos'));
        expect(screen.getByText('Parcela M1')).toBeTruthy();
        fireEvent.click(screen.getByTitle('Recolher todos os grupos'));
        expect(screen.queryByText('Parcela J1')).toBeNull();
        expect(screen.queryByText('Parcela S1')).toBeNull();
    });

    it('"selecionar todos" ignora grupo recolhido; o lote mantém o que foi marcado antes de recolher', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        agruparPor('cliente');

        // Marca um título de Maria e depois recolhe o grupo dela.
        const checkM1 = within(screen.getByText('Parcela M1').closest('tr')!).getByRole('checkbox');
        fireEvent.click(checkM1);
        fireEvent.click(cabecalho('Maria'));

        // "Selecionar todos" marca só João e "Sem cliente" (os visíveis)…
        fireEvent.click(screen.getByTitle('Selecionar todos (não recebidos)'));
        // …e o lote soma os 3: M1 (marcado antes) + J1 + S1. M2 (escondido, nunca marcado) fica fora.
        await waitFor(() => expect(screen.getByText(/3 selecionados/)).toBeTruthy());
        expect(screen.getByText(/360,00/)).toBeTruthy();
    });

    it('sem agrupamento a tabela fica como antes: nenhuma linha de grupo', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        expect(document.querySelectorAll('tbody span.font-semibold')).toHaveLength(0);
        // "Recolher/expandir todos" fica SEMPRE à vista (15/10/2026) — desligado,
        // dizendo o que fazer para ligar.
        const todos = screen.getByRole('button', { name: 'Recolher todos os grupos' }) as HTMLButtonElement;
        expect(todos.disabled).toBe(true);
        expect(todos.title).toMatch(/Escolha um campo em "Agrupar"/);
        // O seletor Crescente/Decrescente também fica à vista, desligado e dizendo o porquê.
        const ordem = screen.getByRole('combobox', { name: 'Ordem dos grupos' }) as HTMLSelectElement;
        expect(ordem.disabled).toBe(true);
        expect(ordem.title).toMatch(/Escolha um campo em "Agrupar" para ordenar os grupos/);
    });

    it('ao agrupar, "recolher todos" liga e alterna para "expandir todos"', async () => {
        render(<ContasReceberManager organizationId="org1" />);
        await screen.findByText('Parcela M1');
        agruparPor('cliente');
        const todos = screen.getByRole('button', { name: 'Recolher todos os grupos' }) as HTMLButtonElement;
        expect(todos.disabled).toBe(false);
        fireEvent.click(todos);
        expect(screen.queryByText('Parcela M1')).toBeNull();
        expect(screen.getByRole('button', { name: 'Expandir todos os grupos' })).toBeTruthy();
    });
});
