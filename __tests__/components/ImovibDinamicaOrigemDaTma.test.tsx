// @vitest-environment jsdom
/**
 * Item 4.5 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md:
 * "De onde vem esta taxa", ao lado da TMA na aba Dinâmica.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ updateStudy: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/contractIndexService', () => ({ contractIndexService: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import ImovibDynamicForm from '../../components/ImovibDynamicForm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const tela = (over: Record<string, unknown> = {}, onDataChanged = vi.fn()) => render(
    <ImovibEdicaoProvider value={{ pode: true, motivo: '' }}>
        <ImovibDynamicForm study={{ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} onDataChanged={onDataChanged} />
    </ImovibEdicaoProvider>,
);

describe('4.5 — origem da TMA', () => {
    beforeEach(() => { svc.updateStudy.mockReset(); svc.updateStudy.mockResolvedValue({}); });

    it('grava o texto ao sair do campo e recarrega o estudo', async () => {
        const user = userEvent.setup();
        const onDataChanged = vi.fn();
        tela({}, onDataChanged);
        await user.type(screen.getByLabelText('De onde vem esta taxa'), 'CDI + 4 p.p.');
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { discount_rate_basis: 'CDI + 4 p.p.' });
        expect(onDataChanged).toHaveBeenCalled();
    });

    it('reaparece ao reabrir; sair sem mudar não grava; apagar grava vazio', async () => {
        const user = userEvent.setup();
        tela({ discount_rate_basis: 'Custo de oportunidade' });
        const campo = screen.getByLabelText('De onde vem esta taxa') as HTMLInputElement;
        expect(campo.value).toBe('Custo de oportunidade');
        await user.click(campo);
        await user.tab();
        expect(svc.updateStudy).not.toHaveBeenCalled();
        await user.clear(campo);
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { discount_rate_basis: null });
    });
});

/** Pendência da Fase 1 do plano: apagar um campo gravava 0 em vez de voltar ao padrão. */
describe('campos numéricos da aba Dinâmica', () => {
    beforeEach(() => { svc.updateStudy.mockReset(); svc.updateStudy.mockResolvedValue({}); });

    it('apagar a TMA grava vazio (padrão) e mostra o padrão', async () => {
        const user = userEvent.setup();
        tela({ discount_rate: 15 });
        const campo = screen.getByLabelText('TMA / Desconto (Ano)') as HTMLInputElement;
        await user.clear(campo);
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { discount_rate: null });
        expect(campo.value).toBe('12');
    });

    it('grava só o campo que mudou', async () => {
        const user = userEvent.setup();
        tela({ discount_rate: 12 });
        const campo = screen.getByLabelText('Inflação geral (% a.m.)') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '0,5'.replace(',', '.'));
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledTimes(1);
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { inflation_rate: 0.5 });
    });

    it('apagar campo que já estava vazio, ou sair sem mudar, não grava', async () => {
        const user = userEvent.setup();
        tela({ brokerage_fee: null });
        const campo = screen.getByLabelText('Comissão / Marketing') as HTMLInputElement;
        await user.click(campo);
        await user.tab();
        await user.clear(campo);
        await user.tab();
        expect(svc.updateStudy).not.toHaveBeenCalled();
    });

    it('mês zero é gravado como veio (o motor avisa), não troca pelo padrão', async () => {
        const user = userEvent.setup();
        tela();
        const campo = screen.getByLabelText('Mês Início Vendas') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '0');
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { sales_start_month: 0 });
    });
});

/** Deixado para depois (M5 da revisão de tela): volta ao valor anterior antes da recarga. */
describe('aba Dinâmica — A → B → A antes da recarga', () => {
    beforeEach(() => { svc.updateStudy.mockReset(); svc.updateStudy.mockResolvedValue({}); });

    it('a volta para A também grava (o estudo da tela ainda diz A, o banco já diz B)', async () => {
        const user = userEvent.setup();
        tela({ discount_rate: 12 });
        const campo = screen.getByLabelText('TMA / Desconto (Ano)') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '15');
        await user.tab();
        await user.clear(campo);
        await user.type(campo, '12');
        await user.tab();
        expect(svc.updateStudy).toHaveBeenNthCalledWith(1, 'estudo-teste', { discount_rate: 15 });
        expect(svc.updateStudy).toHaveBeenNthCalledWith(2, 'estudo-teste', { discount_rate: 12 });
    });
});
