// @vitest-environment jsdom
/**
 * Controladoria — UM período, regime e obra para as seis abas (plano
 * docs/planos/2026-11-14-controladoria-critica.md, passo 2; decisão do usuário
 * "Um período para todas").
 *
 * Antes: cada aba tinha o próprio período e trocar de aba voltava para
 * 01/01–31/12 — quem lia DRE e Balancete do mesmo mês redigitava as datas.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getDRESummary: vi.fn(),
    getDREByProject: vi.fn(),
    listObras: vi.fn(),
    getBalancete: vi.fn(),
    getCashFlow: vi.fn(),
    getProjectWIP: vi.fn(),
    getDRESPESummary: vi.fn(),
}));
// O store (obra aberta no topo) puxa o cliente do Supabase, que exige env.
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import { useStore } from '../../store/useStore';

const ano = new Date().getFullYear();
const resumo = { period_from: '', period_to: '', lines: [], detail: [], receita_bruta: 0, receita_liquida: 0,
    lucro_bruto: 0, ebitda: 0, resultado_liquido: 0, margem_bruta_pct: null, margem_ebitda_pct: null, margem_liquida_pct: null };
const OBRAS = [{ project_id: 'obra-1', project_name: 'Garden', code: '017' }];

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.getDRESummary.mockResolvedValue(resumo);
    svc.getDREByProject.mockResolvedValue([]);
    svc.listObras.mockResolvedValue(OBRAS);
    svc.getBalancete.mockResolvedValue([]);
    svc.getCashFlow.mockResolvedValue({ points: [], total_credit: 0, total_debit: 0, saldo_final: 0, saldo_prev: 0 });
    svc.getProjectWIP.mockResolvedValue([]);
    svc.getDRESPESummary.mockResolvedValue([]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null });
});

describe('Controladoria — escopo único', () => {
    it('título → abas → barra de escopo, nessa ordem; o título muda com a aba', async () => {
        render(<ControladoriaModule />);
        const h1 = await screen.findByRole('heading', { level: 1, name: 'DRE' });
        const abas = screen.getByRole('tablist');
        const de = await screen.findByLabelText('De');
        expect(h1.compareDocumentPosition(abas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(abas.compareDocumentPosition(de) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(screen.getByRole('tab', { name: 'Balancete' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Balancete' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Balancete' }).getAttribute('aria-selected')).toBe('true');
    });

    it('período e regime escolhidos na DRE valem no Balancete (não voltam ao padrão)', async () => {
        render(<ControladoriaModule />);
        fireEvent.change(await screen.findByLabelText('De'), { target: { value: `${ano}-03-01` } });
        fireEvent.change(screen.getByLabelText('Até'), { target: { value: `${ano}-03-31` } });
        fireEvent.change(screen.getByLabelText('Regime'), { target: { value: 'COMPETENCIA' } });

        fireEvent.click(screen.getByRole('tab', { name: 'Balancete' }));
        await waitFor(() => expect(svc.getBalancete).toHaveBeenCalledWith('org-1', `${ano}-03-01`, `${ano}-03-31`, undefined, 'COMPETENCIA'));
        expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe(`${ano}-03-01`);
        expect((screen.getByLabelText('Regime') as HTMLSelectElement).value).toBe('COMPETENCIA');
    });

    it('sem botão "Atualizar": a aba recarrega sozinha ao mudar o escopo', async () => {
        render(<ControladoriaModule />);
        await screen.findByLabelText('De');
        expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    });

    it('voltar para uma aba que usa o regime devolve o valor escolhido (o "Não se aplica" não o apaga)', async () => {
        render(<ControladoriaModule />);
        fireEvent.change(await screen.findByLabelText('Regime'), { target: { value: 'COMPETENCIA' } });
        fireEvent.click(screen.getByRole('tab', { name: 'Fluxo de caixa' }));
        await waitFor(() => expect((screen.getByLabelText('Regime') as HTMLSelectElement).disabled).toBe(true));
        fireEvent.click(screen.getByRole('tab', { name: 'Balancete' }));
        await waitFor(() => expect((screen.getByLabelText('Regime') as HTMLSelectElement).value).toBe('COMPETENCIA'));
    });

    it('a obra aberta no topo é o ponto de partida do filtro de obra', async () => {
        useStore.setState({ projectId: 'obra-1' });
        render(<ControladoriaModule />);
        await waitFor(() => expect((screen.getByLabelText('Obra') as HTMLSelectElement).value).toBe('obra-1'));
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledWith('org-1', `${ano}-01-01`, `${ano}-12-31`, 'obra-1', 'CAIXA'));
    });

    it('projeto do topo que não é obra (orçamento, planejamento) não vira filtro', async () => {
        useStore.setState({ projectId: 'orcamento-9' });
        render(<ControladoriaModule />);
        await waitFor(() => expect(svc.listObras).toHaveBeenCalled());
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalled());
        expect((screen.getByLabelText('Obra') as HTMLSelectElement).value).toBe('');
    });

    it('o que não vale na aba fica desligado E diz por quê (Fluxo: regime e obra)', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'Fluxo de caixa' }));
        // Re-busca a cada tentativa: o campo achado logo após o clique pode ser o da aba que saiu.
        await waitFor(() => expect((screen.getByLabelText('Regime') as HTMLSelectElement).disabled).toBe(true));
        const regime = screen.getByLabelText('Regime') as HTMLSelectElement;
        expect(regime.closest('[title]')?.getAttribute('title')).toMatch(/sempre pelo caixa/);
        const obra = screen.getByLabelText('Obra') as HTMLSelectElement;
        expect(obra.disabled).toBe(true);
        expect(obra.closest('[title]')?.getAttribute('title')).toMatch(/não separa por obra/);
        // Mostra "Não se aplica", não o valor das outras abas ("Competência" no Fluxo enganaria).
        expect(regime.selectedOptions[0].textContent).toBe('Não se aplica');
        expect(obra.selectedOptions[0].textContent).toBe('Não se aplica');
    });

    it('WIP: "De" desligado e a data final vira "Posição em"', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'WIP' }));
        const posicao = await screen.findByLabelText('Posição em') as HTMLInputElement;
        expect(posicao.value).toBe(`${ano}-12-31`);
        expect((screen.getByLabelText('De') as HTMLInputElement).disabled).toBe(true);
        await waitFor(() => expect(svc.getProjectWIP).toHaveBeenCalledWith('org-1', `${ano}-12-31`));
    });

    it('cada campo da barra tem rótulo associado (leitor de tela)', async () => {
        render(<ControladoriaModule />);
        const barra = (await screen.findByLabelText('De')).closest('div.flex')!.parentElement!;
        for (const nome of ['De', 'Até', 'Regime', 'Obra']) {
            expect(within(barra).getByLabelText(nome)).toBeTruthy();
        }
    });
});
