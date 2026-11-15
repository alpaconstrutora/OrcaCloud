// @vitest-environment jsdom
/**
 * Controladoria, 2ª crítica (15/11/2026) — publicação 1: a leitura da DRE.
 *  - Caixa continua sendo a abertura (decisão do usuário), mas cada indicador diz o
 *    valor COM o pendente e o Resultado leva a conciliar;
 *  - um sinal só: o que sai do resultado é negativo no Resumo e no Por Categoria.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({ getDRESummary: vi.fn(), getDREByProject: vi.fn(), listObras: vi.fn() }));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import { useStore } from '../../store/useStore';

const norm = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

// Números de produção (2026, Caixa) da 2ª crítica.
const resumo = {
    period_from: '', period_to: '',
    lines: [
        { linha: 'Receita Bruta', valor_realizado: 4000, valor_previsto: 1371437.14 },
        { linha: '(-) Deduções', valor_realizado: 0, valor_previsto: 5363.15 },
        { linha: '= Receita Líquida', valor_realizado: 4000, valor_previsto: 1366073.99 },
        { linha: '(-) Custos Diretos', valor_realizado: 6000, valor_previsto: 1105568.55 },
        { linha: '= Lucro Bruto', valor_realizado: -2000, valor_previsto: 260505.44 },
        { linha: '= EBITDA', valor_realizado: -5021.18, valor_previsto: 230713.97 },
        { linha: '= Resultado Líquido', valor_realizado: -5021.18, valor_previsto: 230713.97 },
        { linha: '(!) Sem Classificação', valor_realizado: -7619.23, valor_previsto: -33681.35 },
    ],
    detail: [
        { dre_group: 'DESPESA_ADM', category_name: 'Energia', net: -3021.18, pending_credit: 0, pending_debit: 0 },
        { dre_group: 'CUSTO_OBRA', category_name: 'Mão de Obra', net: -6000, pending_credit: 0, pending_debit: 0 },
        { dre_group: 'RECEITA_BRUTA', category_name: 'Receita de Obra', net: 4000, pending_credit: 0, pending_debit: 0 },
    ],
    receita_bruta: 4000, receita_liquida: 4000, lucro_bruto: -2000, ebitda: -5021.18, resultado_liquido: -5021.18,
    margem_bruta_pct: -50, margem_ebitda_pct: -125.5295, margem_liquida_pct: -125.5295,
};

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.getDRESummary.mockResolvedValue(resumo);
    svc.getDREByProject.mockResolvedValue([]);
    svc.listObras.mockResolvedValue([]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null, activeView: 'controladoria' });
});

describe('DRE em Caixa — o pendente à vista', () => {
    it('cada indicador diz o valor com o pendente; o Resultado leva a conciliar', async () => {
        render(<ControladoriaModule />);
        // EBITDA e Resultado coincidem nestes números: as duas legendas aparecem
        expect(await screen.findAllByText('Com o pendente: R$ 225.692,79 · margem -125,5%')).toHaveLength(2);
        expect(screen.getByText('Com o pendente: R$ 1.370.073,99 · receita bruta R$ 4.000,00')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Conciliar lançamentos/ }));
        expect(useStore.getState().activeView).toBe('bank-reconciliation');
    });

    it('em Competência: sem "com o pendente", sem ação e sem previsto no aviso', async () => {
        render(<ControladoriaModule />);
        await screen.findAllByText(/Com o pendente/);
        fireEvent.change(screen.getByLabelText('Regime'), { target: { value: 'COMPETENCIA' } });
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenLastCalledWith('org-1', expect.any(String), expect.any(String), undefined, 'COMPETENCIA'));
        await waitFor(() => expect(screen.queryByText(/com o pendente/i)).toBeNull());
        expect(screen.queryByRole('button', { name: /Conciliar lançamentos/ })).toBeNull();
        const aviso = await screen.findByText(/ficaram fora do resultado/);
        expect(norm(aviso.textContent)).not.toContain('previsto');
    });
});

describe('DRE — um sinal só', () => {
    it('custo é negativo no Resumo E no Por Categoria; o rótulo não é vermelho', async () => {
        render(<ControladoriaModule />);
        const rotulo = await screen.findByText('(-) Custos Diretos');
        const linha = rotulo.closest('tr')!;
        expect(norm(linha.querySelectorAll('td')[1].textContent)).toBe('-R$ 6.000,00');
        expect(rotulo.className).not.toMatch(/text-red/);
        // linha vazia que sai do resultado: zero sem sinal, nunca "-R$ 0,00"
        expect(norm(screen.getByText('(-) Deduções').closest('tr')!.querySelectorAll('td')[1].textContent)).toBe('R$ 0,00');
        // valor de custo negativo não é alarme: só total abaixo do limiar fica vermelho
        expect(linha.querySelectorAll('td')[1].className).not.toMatch(/text-red/);
        const resultado = screen.getByText('= Resultado Líquido').closest('tr')!;
        expect(resultado.querySelectorAll('td')[1].className).toMatch(/text-red/);

        fireEvent.click(screen.getByRole('button', { name: 'Por Categoria' }));
        const custos = (await screen.findByRole('button', { name: /Custos de Obra/ })).closest('tr')!;
        expect(norm(custos.querySelectorAll('td')[1].textContent)).toBe('-R$ 6.000,00');
    });

    it('Por Categoria segue a ordem contábil (receita → custos → despesas)', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Por Categoria' }));
        await screen.findByRole('button', { name: /Receita Bruta/ });
        const grupos = screen.getAllByRole('button', { expanded: false }).map(b => norm(b.textContent));
        const ordem = ['Receita Bruta', 'Custos de Obra', 'Despesas Administrativas'].map(g => grupos.findIndex(t => t.includes(g)));
        expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
        expect(ordem.every(i => i >= 0)).toBe(true);
    });
});
