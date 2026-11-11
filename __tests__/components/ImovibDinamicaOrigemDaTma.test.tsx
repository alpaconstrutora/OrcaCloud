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
