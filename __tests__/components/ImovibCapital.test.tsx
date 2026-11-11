// @vitest-environment jsdom
/**
 * Aba Capital (Fase 4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * capital próprio calculado (D2), regras do financiamento, outras fontes, aportes e
 * modo só leitura.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    updateStudy: vi.fn(),
    salvarFonte: vi.fn(),
    excluirFonte: vi.fn(),
}));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibCapitalForm from '../../components/ImovibCapitalForm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { ConfirmProvider } from '../../components/ui/confirm';
import { baseStudy } from '../fixtures/imovibEstudos';
import { computeImovibMath } from '../../utils/imovibMotor';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy({ funding_debt_percent: 60, ...over }), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const tela = (opts: { somenteLeitura?: boolean; over?: Record<string, unknown>; onDataChanged?: () => void } = {}) => render(
    <ConfirmProvider>
        <ImovibEdicaoProvider value={opts.somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
            <ImovibCapitalForm study={estudo(opts.over) as never} onDataChanged={opts.onDataChanged ?? vi.fn()} />
        </ImovibEdicaoProvider>
    </ConfirmProvider>,
);

describe('Aba Capital', () => {
    beforeEach(() => {
        for (const f of Object.values(svc)) f.mockReset();
        svc.updateStudy.mockResolvedValue({});
    });

    it('4.2 e 4B.1 — o capital próprio é calculado: cinco fatias (com as vendas durante a obra) que somam 100%, sem o campo digitado', () => {
        tela();
        const secao = screen.getByRole('region', { name: 'De onde vem o dinheiro' });
        // No KPI e na legenda da barra.
        expect(within(secao).getAllByText('Capital próprio necessário')).toHaveLength(2);
        expect(within(secao).getAllByText('Vendas durante a obra')).toHaveLength(2);
        const pcts = within(secao).getAllByText(/% do total$/).map(e => parseFloat(e.textContent!.replace(',', '.')));
        expect(pcts).toHaveLength(5);
        expect(pcts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
        expect(screen.queryByText('Capital próprio (equity)')).toBeNull();
    });

    it('4.1 — trocar os juros na obra grava a escolha', async () => {
        const user = userEvent.setup();
        tela();
        await user.selectOptions(screen.getByLabelText('Juros na obra'), 'paga_mensal');
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { financing_interest_mode: 'paga_mensal' });
    });

    it('4.4 — nova fonte: o botão diz o que falta e, preenchida, grava, fecha o drawer e recarrega o estudo', async () => {
        const user = userEvent.setup();
        const onDataChanged = vi.fn();
        svc.salvarFonte.mockImplementation(async (f: Record<string, unknown>) => ({ ...f, id: 'f1' }));
        tela({ onDataChanged });
        await user.click(screen.getByRole('button', { name: 'Nova fonte' }));
        await user.type(screen.getByLabelText('Nome'), 'Mútuo do sócio');
        const criar = screen.getByRole('button', { name: 'Criar fonte' });
        expect(criar.hasAttribute('disabled')).toBe(true);
        expect(criar.getAttribute('title')).toBe('Informe o valor que entra.');
        await user.type(screen.getByLabelText('Valor (R$)'), '500000');
        await user.type(screen.getByLabelText('Juros (% a.a.)'), '12');
        await user.click(criar);
        expect(svc.salvarFonte).toHaveBeenCalledWith(expect.objectContaining({
            study_id: 'estudo-teste', name: 'Mútuo do sócio', amount: 500000, entry_month: 1, remuneration: 'juros',
            rate_annual: 12, amortization: 'BULLET', term_months: 24, profit_share_percent: null,
        }));
        expect(onDataChanged).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Criar fonte' })).toBeNull();
        expect(screen.getByText('Mútuo do sócio')).toBeTruthy();
    });

    it('4.4 — carência escondida (BULLET) não trava o botão e grava 0', async () => {
        const user = userEvent.setup();
        svc.salvarFonte.mockImplementation(async (f: Record<string, unknown>) => ({ ...f, id: 'f1' }));
        tela();
        await user.click(screen.getByRole('button', { name: 'Nova fonte' }));
        await user.type(screen.getByLabelText('Nome'), 'Mútuo');
        await user.type(screen.getByLabelText('Valor (R$)'), '100000');
        await user.type(screen.getByLabelText('Juros (% a.a.)'), '10');
        await user.selectOptions(screen.getByLabelText('Amortização'), 'PRICE');
        await user.clear(screen.getByLabelText('Carência do principal (meses)'));
        await user.type(screen.getByLabelText('Carência do principal (meses)'), '10');
        await user.selectOptions(screen.getByLabelText('Amortização'), 'BULLET');
        await user.clear(screen.getByLabelText('Prazo (meses)'));
        await user.type(screen.getByLabelText('Prazo (meses)'), '6');
        const criar = screen.getByRole('button', { name: 'Criar fonte' });
        expect(criar.hasAttribute('disabled')).toBe(false);
        await user.click(criar);
        expect(svc.salvarFonte).toHaveBeenCalledWith(expect.objectContaining({ amortization: 'BULLET', term_months: 6, grace_months: 0 }));
    });

    it('4.4 — por participação, o drawer pede a participação e não os juros', async () => {
        const user = userEvent.setup();
        tela();
        await user.click(screen.getByRole('button', { name: 'Nova fonte' }));
        await user.selectOptions(screen.getByLabelText('Remuneração'), 'participacao');
        expect(screen.queryByLabelText('Juros (% a.a.)')).toBeNull();
        expect(screen.getByLabelText('Participação (% de cada distribuição)')).toBeTruthy();
    });

    it('4.3 — aportes por ano; clicar no ano abre os meses', async () => {
        const user = userEvent.setup();
        tela();
        const secao = screen.getByRole('region', { name: 'Aportes e distribuições' });
        expect(within(secao).queryByText('Mês 1')).toBeNull();
        await user.click(within(secao).getByText('Ano 1'));
        expect(within(secao).getByText('Mês 1')).toBeTruthy();
        expect(within(secao).getByText('Mês 12')).toBeTruthy();
    });

    it('4.3 + 4.4 — com fonte por participação, o cartão abre a parte das fontes e o lucro do incorporador é o do Resumo', () => {
        const fonte = { id: 'f1', study_id: 'estudo-teste', name: 'SCP', kind: 'scp', amount: 1_000_000, entry_month: 3, remuneration: 'participacao', rate_annual: null, profit_share_percent: 30, amortization: 'BULLET', term_months: null, grace_months: null, sort_order: 0 };
        const over = { funding_sources: [fonte], min_cash_balance: 2_000_000 };
        tela({ over });
        const r = computeImovibMath(estudo(over) as never);
        const lucro = r.monthlyFlows.reduce((a, f) => a + f.net, 0);
        // O Testing Library normaliza o espaço não separável do "R$ " na tela, não no texto procurado.
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/\s/g, ' ');
        const secao = screen.getByRole('region', { name: 'Aportes e distribuições' });
        expect(within(secao).getByText('Lucro do incorporador')).toBeTruthy();
        expect(within(secao).getByText(fmt(lucro))).toBeTruthy();
        expect(within(secao).getByRole('columnheader', { name: /Para as fontes/ })).toBeTruthy();
    });

    it('só leitura: nada grava e os botões dizem por quê', () => {
        tela({ somenteLeitura: true, over: { funding_sources: [{ id: 'f1', study_id: 'estudo-teste', name: 'CRI', kind: 'cri', amount: 1_000_000, entry_month: 2, remuneration: 'juros', rate_annual: 13, profit_share_percent: null, amortization: 'BULLET', term_months: 12, grace_months: 0, sort_order: 0 }] } });
        const nova = screen.getByRole('button', { name: 'Nova fonte' });
        expect(nova.hasAttribute('disabled')).toBe(true);
        expect(nova.getAttribute('title')).toBe('Sem permissão');
        expect((screen.getByLabelText('Juros na obra') as HTMLSelectElement).closest('fieldset')!.disabled).toBe(true);
        expect(screen.getByText('CRI')).toBeTruthy();
        expect(svc.updateStudy).not.toHaveBeenCalled();
    });
});
