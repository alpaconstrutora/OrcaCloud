// @vitest-environment jsdom
/**
 * Portal do Síndico › Visão geral › Ficha do condomínio (G7, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O que fica travado:
 *  1. multa acima de 2% não salva (CC 1.336 §1º) — o botão diz por quê;
 *  2. multa e juros com vírgula vão como número, e o aviso diz que valem nas próximas cobranças;
 *  3. mandato e exigência de aprovação aparecem só para leitura;
 *  4. sem login nada grava.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ getFicha: vi.fn(), salvarFicha: vi.fn() }));
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: svc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import FichaDoCondominioSheet from '../../components/sindico/FichaDoCondominioSheet';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import type { CondominioDoSindico } from '../../services/sindicoPortalService';

const COND = { id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: null, razaoSocial: null, cidade: null, mandatoInicio: null, mandatoFim: null } as CondominioDoSindico;

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    svc.getFicha.mockResolvedValue({ motivoNaoOpera: null, ficha: {
        razaoSocial: null, cnpj: null, instaladoEm: null, multaPercent: 2, jurosMesPercent: 1,
        mandatoInicio: '2026-10-01', mandatoFim: '2027-10-01', exigeAprovacao: true,
    } });
});

describe('Ficha do condomínio', () => {
    it('1–3. multa acima de 2% não salva; com vírgula vai como número; mandato só leitura', async () => {
        svc.salvarFicha.mockResolvedValue(undefined);
        const onSalvo = vi.fn();
        render(<ConfirmProvider><FichaDoCondominioSheet condominio={COND} identidade={{ token: 't' }} logado onClose={vi.fn()} onSalvo={onSalvo} /></ConfirmProvider>);
        const multa = await screen.findByLabelText('Multa (%)');
        expect(screen.getByText(/Seu mandato:/)).toBeTruthy();
        expect(screen.getByText('Rateio exige a aprovação do síndico.')).toBeTruthy();
        fireEvent.change(multa, { target: { value: '3' } });
        const salvar = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
        expect(salvar.parentElement?.getAttribute('title')).toBe('A multa por atraso vai de 0 a 2% (Código Civil, art. 1.336, § 1º).');
        fireEvent.change(multa, { target: { value: '1,5' } });
        fireEvent.change(screen.getByLabelText('Juros ao mês (%)'), { target: { value: '0,8' } });
        fireEvent.click(salvar);
        await waitFor(() => expect(svc.salvarFicha).toHaveBeenCalledWith({ token: 't' }, 'c1', expect.objectContaining({ multa: '1,5', juros: '0,8' })));
        expect(onSalvo).toHaveBeenCalledWith('Ficha salva. A multa e os juros novos valem para as próximas cobranças.');
    });

    it('4. sem login nada grava', async () => {
        render(<ConfirmProvider><FichaDoCondominioSheet condominio={COND} identidade={{ token: 't' }} logado={false} onClose={vi.fn()} onSalvo={vi.fn()} /></ConfirmProvider>);
        await screen.findByLabelText('Multa (%)');
        expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).parentElement?.getAttribute('title')).toBe(MOTIVO_SEM_LOGIN);
    });
});
