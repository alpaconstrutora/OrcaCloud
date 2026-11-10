/**
 * Proposta em PDF de uma venda com juros (Price/SAC) — seção "Condições da
 * Negociação". Plano: docs/planos/2026-11-09-negociacao-parcelamento-com-juros.md
 * (revisão final, I-4).
 *
 * Antes: "Valor Total" = preço (deal.value) e a tabela do plano logo abaixo somava
 * o total com juros — sem taxa, sem sistema, sem total com juros, o cliente via
 * dois totais que não batiam.
 */
import { describe, it, expect, vi } from 'vitest';

// O PDF em si não é gerado aqui: só as linhas da tabela de condições.
vi.mock('jspdf', () => ({ default: class {} }));
vi.mock('jspdf-autotable', () => ({ default: () => undefined }));

import { condicoesDaProposta } from '../services/propertyExportService';
import type { PropertyDeal } from '../types';

// 'YYYY-MM-DD' lido como data de calendário, sem fuso (antes saía o dia anterior em UTC−3).
const dataPrevista = '10/11/2026';
const moeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const venda = (over: Partial<PropertyDeal> = {}) => ({
    id: 'd1', type: 'SALE', value: 120000, date: '2026-11-10', status: 'Proposta',
    contract_total_value: 120000,
    ...over,
}) as PropertyDeal;

describe('condicoesDaProposta — venda com juros', () => {
    it('Price 1% a.m.: mostra taxa, sistema e o total com juros, e mantém o Valor Total (preço)', () => {
        const linhas = condicoesDaProposta(venda({
            interest_rate_monthly: 1, amortization_system: 'PRICE', price_before_interest: 120000, contract_total_value: 126618.53,
        }));
        expect(linhas).toEqual([
            ['Tipo de Negociação', 'Venda'],
            ['Valor Total', moeda(120000)],
            ['Juros a.m.', '1,00%'],
            ['Sistema', 'Price'],
            ['Valor Total com juros', moeda(126618.53)],
            ['Data Prevista', dataPrevista],
            ['Status Atual', 'Proposta'],
        ]);
    });

    it('SAC com taxa quebrada: "SAC" e a taxa como foi digitada', () => {
        const linhas = condicoesDaProposta(venda({
            interest_rate_monthly: 1.25, amortization_system: 'SAC', contract_total_value: 129000,
        }));
        expect(linhas).toContainEqual(['Juros a.m.', '1,25%']);
        expect(linhas).toContainEqual(['Sistema', 'SAC']);
        expect(linhas).toContainEqual(['Valor Total com juros', moeda(129000)]);
    });

    it('venda sem juros: as linhas de sempre, nenhuma de juros', () => {
        const linhas = condicoesDaProposta(venda({ interest_rate_monthly: null }));
        expect(linhas).toEqual([
            ['Tipo de Negociação', 'Venda'],
            ['Valor Total', moeda(120000)],
            ['Data Prevista', dataPrevista],
            ['Status Atual', 'Proposta'],
        ]);
    });

    it('locação: nunca linha de juros (mensal, nº e total, como antes)', () => {
        const linhas = condicoesDaProposta(venda({
            type: 'RENTAL', value: 2500, installment_value: 2500, installments: 12, contract_total_value: 30000,
            interest_rate_monthly: 1,
        }));
        expect(linhas.map(l => l[0])).toEqual([
            'Tipo de Negociação', 'Valor Mensal', 'Nº de Parcelas', 'Valor Total do Contrato', 'Data Prevista', 'Status Atual',
        ]);
    });
});

describe('condicoesDaProposta — Data Prevista sem fuso', () => {
    it('1º do mês continua 1º (em UTC−3 o new Date de 2026-12-01 dava 30/11)', () => {
        const linha = condicoesDaProposta(venda({ date: '2026-12-01' })).find(l => l[0] === 'Data Prevista');
        expect(linha?.[1]).toBe('01/12/2026');
    });
});
