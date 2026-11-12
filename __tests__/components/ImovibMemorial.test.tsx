// @vitest-environment jsdom
/**
 * Premissas › Memorial (item 10.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ updateStudy: vi.fn(), listarEmpreendimentosParaVincular: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { getById: vi.fn().mockResolvedValue(null), listRegulatoryZonesByImovibStudy: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import ImovibPremisesForm from '../../components/ImovibPremisesForm';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { CAMPOS_DO_MOTOR } from '../../utils/imovibMotor';
import { baseStudy } from '../fixtures/imovibEstudos';

const tela = async (over: Record<string, unknown> = {}, somenteLeitura = false) => {
    const user = userEvent.setup();
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ImovibEdicaoProvider value={somenteLeitura ? { pode: false, motivo: 'Sem permissão' } : { pode: true, motivo: '' }}>
                    <ImovibPremisesForm study={{ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} onDataChanged={vi.fn()} />
                </ImovibEdicaoProvider>
            </ConfirmProvider>
        </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: /4\. Memorial/ }));
    return user;
};
const memorial = () => screen.getByRole('region', { name: 'Memorial de premissas' });
const total = CAMPOS_DO_MOTOR.length;

beforeEach(() => {
    svc.updateStudy.mockReset().mockResolvedValue({});
    svc.listarEmpreendimentosParaVincular.mockReset().mockResolvedValue([]);
});

describe('10.1 — sub-aba Memorial', () => {
    it('lista as premissas do motor e conta as sem fonte', async () => {
        await tela();
        expect(within(memorial()).getByText(`${total} de ${total} premissas sem fonte`)).toBeTruthy();
        expect(within(memorial()).getByText('TMA')).toBeTruthy();
    });

    it('anotar a fonte e a data muda o contador e grava com "Salvar Premissas"', async () => {
        const user = await tela();
        await user.type(within(memorial()).getByLabelText('Fonte de TMA'), 'Comitê de investimento');
        expect(within(memorial()).getByText(`${total - 1} de ${total} premissas sem fonte`)).toBeTruthy();
        await user.type(within(memorial()).getByLabelText('Data de TMA'), '2026-11-01');
        await user.click(screen.getByRole('button', { name: /Salvar Premissas/ }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({
            premise_notes: { discount_rate: { fonte: 'Comitê de investimento', data: '2026-11-01' } },
        }));
    });

    it('a fonte gravada volta preenchida', async () => {
        await tela({ premise_notes: { discount_rate: { fonte: 'CDI + 4 p.p.', data: '2026-10-01' } } });
        expect((within(memorial()).getByLabelText('Fonte de TMA') as HTMLInputElement).value).toBe('CDI + 4 p.p.');
        expect(within(memorial()).getByText(`${total - 1} de ${total} premissas sem fonte`)).toBeTruthy();
    });

    it('"Salvar Premissas" não regrava o parecer nem os mínimos (outra pessoa pode ter registrado depois)', async () => {
        const user = await tela({ recommendation: 'reprovar', recommendation_notes: 'x', recommended_by: 'Bruno', hurdle_margin_percent: 20 });
        await user.type(within(memorial()).getByLabelText('Fonte de TMA'), 'Comitê');
        await user.click(screen.getByRole('button', { name: /Salvar Premissas/ }));
        const enviado = svc.updateStudy.mock.calls[0][1];
        for (const k of ['recommendation', 'recommendation_notes', 'recommended_by', 'recommended_at', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure']) {
            expect(enviado, k).not.toHaveProperty(k);
        }
        expect(enviado).toHaveProperty('premise_notes');
    });

    it('quem só lê não edita a fonte', async () => {
        await tela({}, true);
        expect(within(memorial()).getByLabelText('Fonte de TMA').matches(':disabled')).toBe(true);
    });
});
