// @vitest-environment jsdom
/**
 * Controladoria — uma linguagem para as seis abas (plano
 * docs/planos/2026-11-14-controladoria-critica.md, passo 4).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({
    getDRESummary: vi.fn(), getDREByProject: vi.fn(), listObras: vi.fn(),
    getBalancete: vi.fn(), getCashFlow: vi.fn(),
}));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import { useStore } from '../../store/useStore';
import { montarCSV } from '../../components/controladoria/csv';
import { tomDoResultado, tomDoSaldo, LIMIAR } from '../../components/controladoria/indicadores';

function resumo(resultado: number) {
    return {
        period_from: '', period_to: '', detail: [],
        lines: [
            { linha: 'Receita Bruta', valor_realizado: 4000, valor_previsto: 1371437.14 },
            { linha: '= Resultado Líquido', valor_realizado: resultado, valor_previsto: 230713.97 },
        ],
        receita_bruta: 4000, receita_liquida: 4000, lucro_bruto: 100, ebitda: 100, resultado_liquido: resultado,
        margem_bruta_pct: 2.5, margem_ebitda_pct: 2.5, margem_liquida_pct: resultado / 40,
    };
}

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.getDREByProject.mockResolvedValue([]);
    svc.listObras.mockResolvedValue([]);
    svc.getBalancete.mockResolvedValue([]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null });
});

describe('indicadores — cor só por limiar com nome', () => {
    it('resultado e saldo abaixo do limiar são alerta; o resto é neutro', () => {
        expect(LIMIAR.resultadoAlerta).toBe(0);
        expect(tomDoResultado(-0.01)).toBe('alerta');
        expect(tomDoResultado(0)).toBe('neutro');
        expect(tomDoSaldo(-1)).toBe('alerta');
        expect(tomDoSaldo(10)).toBe('neutro');
    });

    it('DRE: Resultado negativo vem com o aviso que não depende de cor', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(-5021.18));
        render(<ControladoriaModule />);
        // o valor do card (o mesmo número também está na linha da tabela)
        const valor = await screen.findByText('-R$ 5.021,18', { selector: 'span.truncate' });
        expect(valor.parentElement?.textContent).toContain('(alerta)');
        // quatro indicadores, não cinco: a receita bruta mora na legenda da líquida
        expect(screen.getByText(/Receita bruta R\$/)).toBeTruthy();
        expect(screen.queryByText('Receita Bruta', { selector: 'p' })).toBeNull();
    });
});

describe('DRE — "Previsto" só no Caixa', () => {
    it('em Competência a coluna some (ela repetia o realizado)', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(100));
        render(<ControladoriaModule />);
        expect(await screen.findByText('Previsto (pendente)')).toBeTruthy();
        expect(screen.getByText('R$ 1.371.437,14')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Regime'), { target: { value: 'COMPETENCIA' } });
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenLastCalledWith('org-1', expect.any(String), expect.any(String), undefined, 'COMPETENCIA'));
        await waitFor(() => expect(screen.queryByText(/^Previsto/)).toBeNull());
        expect(screen.queryByText('R$ 1.371.437,14')).toBeNull();
    });
});

describe('Balancete — grupo pelo teclado', () => {
    it('Enter recolhe e expande o grupo; aria-expanded acompanha', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(100));
        svc.getBalancete.mockResolvedValue([{
            category_id: 'c1', category_name: 'Venda de Imóveis', dre_group: 'RECEITA_BRUTA', nature: 'REVENUE',
            sort_order: 1, creditos: 100, debitos: 0, saldo_liquido: 100, n_transacoes: 1, n_partes_juros: 0,
        }]);
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'Balancete' }));
        const grupo = await screen.findByRole('button', { name: /Receita Bruta/ });
        expect(grupo.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText('Venda de Imóveis')).toBeTruthy();
        fireEvent.keyDown(grupo, { key: 'Enter' });
        expect(grupo.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByText('Venda de Imóveis')).toBeNull();
    });
});

describe('Fluxo de caixa — gráfico só com tendência', () => {
    it('com menos de 3 períodos, diz isso em vez de desenhar um gráfico vazio', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(100));
        svc.getCashFlow.mockResolvedValue({
            points: [{ period_label: 'mar/2026', credit_real: 1000, debit_real: 2221.12, saldo_real: -1221.12, saldo_acumulado: -1221.12, saldo_prev: -16599.87 }],
            total_entradas: 1000, total_saidas: 2221.12, saldo_final: -1221.12, saldo_previsto_final: -16599.87,
        });
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'Fluxo de caixa' }));
        expect(await screen.findByText(/Poucos períodos para um gráfico/)).toBeTruthy();
        expect(screen.queryByRole('img')).toBeNull();
    });
});

describe('CSV — um formato para as seis abas', () => {
    it('vírgula entre colunas, texto entre aspas (aspas escapadas), número com ponto', () => {
        expect(montarCSV(['Obra', 'Valor'], [['Garden "A"', 1234.567], [null, -5]]))
            .toBe('"Obra","Valor"\n"Garden ""A""",1234.57\n,-5');
    });
});
