// @vitest-environment jsdom
/**
 * Resumo › Parecer (item 10.3 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ updateStudy: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibParecerCard from '../../components/ImovibParecerCard';
import { ToastProvider } from '../../components/ui/toast';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { useStore } from '../../store/useStore';
import { computeImovibMath } from '../../hooks/useImovibMath';
import { calcularIndicadores } from '../../utils/imovibIndicadores';
import { montarPlanilhaImovib } from '../../components/ImovibExecutiveSummary';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const tela = (over: Record<string, unknown> = {}, pode = true) => {
    const user = userEvent.setup();
    const s = estudo(over);
    const r = computeImovibMath(s as never);
    const onDataChanged = vi.fn();
    render(
        <ToastProvider>
            <ImovibEdicaoProvider value={pode ? { pode: true, motivo: '' } : { pode: false, motivo: 'Sem permissão' }}>
                <ImovibParecerCard study={s as never} resultado={r} indicadores={calcularIndicadores(r, 12)} onDataChanged={onDataChanged} />
            </ImovibEdicaoProvider>
        </ToastProvider>,
    );
    return { user, onDataChanged };
};
const cartao = () => screen.getByRole('region', { name: 'Parecer' });

beforeEach(() => {
    svc.updateStudy.mockReset().mockResolvedValue({});
    useStore.setState({ session: { user: { id: 'u1', email: 'ana@empresa.com', user_metadata: { full_name: 'Ana Souza' } } } } as never);
});

describe('10.3 — cartão do parecer', () => {
    it('mostra os quatro critérios e o valor máximo do terreno; exposição sem limite diz que não há critério', () => {
        tela();
        for (const r of ['TIR acima da TMA', 'Margem líquida sobre o VGV', 'Exposição máxima de caixa', 'VPL positivo']) expect(within(cartao()).getByText(r)).toBeTruthy();
        expect(within(cartao()).getByText(/sem limite definido/i)).toBeTruthy();
        expect(within(cartao()).getByText(/Valor máximo do terreno/)).toBeTruthy();
    });

    it('o sistema não escolhe o parecer: sem escolha, o botão diz por quê', () => {
        tela();
        const b = within(cartao()).getByRole('button', { name: 'Registrar parecer' });
        expect((b as HTMLButtonElement).disabled).toBe(true);
        expect(b.getAttribute('title')).toBe('Escolha o parecer.');
    });

    it('registrar grava o parecer, a justificativa, quem e quando', async () => {
        const { user, onDataChanged } = tela();
        await user.selectOptions(within(cartao()).getByLabelText('Parecer'), 'aprovar_com_condicoes');
        await user.type(within(cartao()).getByLabelText('Justificativa'), 'Margem apertada; renegociar o terreno');
        await user.click(within(cartao()).getByRole('button', { name: 'Registrar parecer' }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', expect.objectContaining({
            recommendation: 'aprovar_com_condicoes',
            recommendation_notes: 'Margem apertada; renegociar o terreno',
            recommended_by: 'Ana Souza',
            recommended_at: expect.any(String),
            // Os números que embasaram o parecer (o banco grava quem e quando pelo usuário logado).
            recommendation_snapshot: expect.objectContaining({ vpl: expect.any(Number), vgv: expect.any(Number) }),
        }));
        expect(onDataChanged).toHaveBeenCalled();
    });

    it('mudar o mínimo da margem grava no estudo', async () => {
        const { user } = tela();
        const campo = within(cartao()).getByLabelText('Margem mínima (%)');
        await user.clear(campo);
        await user.type(campo, '20');
        await user.tab();
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', { hurdle_margin_percent: 20 });
    });

    it('parecer registrado aparece com quem e quando; quem só lê não registra', () => {
        tela({ recommendation: 'reprovar', recommendation_notes: 'VPL negativo', recommended_by: 'Bruno', recommended_at: '2026-11-10T15:00:00Z' }, false);
        expect(within(cartao()).getByText(/Bruno/)).toBeTruthy();
        const b = within(cartao()).getByRole('button', { name: 'Registrar parecer' }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.getAttribute('title')).toBe('Sem permissão');
    });

    it('voltar a "Não registrado" limpa o parecer registrado', async () => {
        const { user } = tela({ recommendation: 'reprovar', recommendation_notes: 'VPL negativo', recommended_by: 'Bruno', recommended_at: '2026-11-10T15:00:00Z' });
        await user.selectOptions(within(cartao()).getByLabelText('Parecer'), '');
        await user.click(within(cartao()).getByRole('button', { name: 'Limpar parecer' }));
        expect(svc.updateStudy).toHaveBeenCalledWith('estudo-teste', {
            recommendation: null, recommendation_notes: null, recommended_by: null, recommended_at: null, recommendation_snapshot: null,
        });
    });

    it('mostra os números que embasaram o parecer e avisa quando os de hoje mudaram', () => {
        tela({ recommendation: 'aprovar', recommended_by: 'Bruno', recommended_at: '2026-11-10T15:00:00Z',
            recommendation_snapshot: { vgv: 1, vpl: 123_456, tirAnual: 18.5, margemLiquidaPct: 20, exposicaoMaxima: 10 } });
        expect(within(cartao()).getByText(/Dado com VPL R\$\s123\.456 e TIR 18,5% a\.a\./)).toBeTruthy();
        expect(within(cartao()).getByText(/os números mudaram desde o parecer/i)).toBeTruthy();
    });

    it('o parecer sai no Excel (aba Parecer)', () => {
        const s = estudo({ recommendation: 'aprovar', recommendation_notes: 'Tudo certo', recommended_by: 'Ana', recommended_at: '2026-11-10T15:00:00Z' });
        const { parecer } = montarPlanilhaImovib(s as never, computeImovibMath(s as never));
        expect(parecer.some(l => l[0] === 'Parecer' && l[1] === 'Aprovar')).toBe(true);
        expect(parecer.some(l => l[0] === 'Justificativa' && l[1] === 'Tudo certo')).toBe(true);
        expect(parecer.some(l => l[0] === 'TIR acima da TMA')).toBe(true);
    });
});
