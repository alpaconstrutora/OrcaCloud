// @vitest-environment jsdom
/**
 * Item 5.3 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md.
 *
 * `InputRow` era declarado DENTRO do render de ImovibFundingForm: cada tecla
 * criava um componente novo, o React desmontava o <input> e o foco caía — não
 * dava para digitar "12,5" de uma vez. O teste trava: o MESMO nó continua
 * focado depois de cada tecla, o pai recebe o número e a gravação só sai no blur.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateStudy = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/imovibService', () => ({
    imovibService: { updateStudy: (...a: unknown[]) => updateStudy(...a) },
}));
vi.mock('../../components/ImovibSalesMapTab', () => ({ default: () => null }));
vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));

import ImovibReceitasForm from '../../components/ImovibReceitasForm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';

const estudo = { id: 'estudo-1', name: 'Teste', revenue_downpayment_percent: 10 } as never;

// Desde a Fase 1 do plano 2026-11-11 o campo é ImovibInputRow, dentro da aba Receitas.
describe('ImovibReceitasForm — digitar sem perder o foco', () => {
    beforeEach(() => updateStudy.mockClear());

    it('digitar "12.5" mantém o mesmo campo focado e grava só no blur', async () => {
        const user = userEvent.setup();
        render(<ImovibReceitasForm study={estudo} onDataChanged={vi.fn()} />);

        // Por papel (e não pelo rótulo) para o teste valer também contra a versão antiga.
        const sinal = () => screen.getAllByRole('spinbutton')[0] as HTMLInputElement;
        const campo = sinal();
        await user.clear(campo);
        await user.type(campo, '12.5');

        // Mesmo nó no DOM e ainda com o foco (antes: nó novo a cada tecla).
        expect(sinal()).toBe(campo);
        expect(document.activeElement).toBe(campo);
        expect(campo.value).toBe('12.5');
        expect(updateStudy).not.toHaveBeenCalled();

        // A soma do perfil de recebimento acompanha a digitação: 12,5 + 20 + 0 + 70 + 0.
        expect(screen.getByText('102.5%')).toBeInTheDocument();

        await user.tab();
        expect(updateStudy).toHaveBeenCalledTimes(1);
        expect(updateStudy).toHaveBeenCalledWith('estudo-1', { revenue_downpayment_percent: 12.5 });
    });

    it('só leitura: o campo continua desabilitado (fieldset imovib-ro)', () => {
        render(
            <ImovibEdicaoProvider value={{ pode: false, motivo: 'Sem permissão' }}>
                <ImovibReceitasForm study={estudo} onDataChanged={vi.fn()} />
            </ImovibEdicaoProvider>,
        );
        expect(screen.getByLabelText('Sinal / ato')).toBeDisabled();
    });
});

describe('ImovibReceitasForm — curva de vendas e perfil (Fase 1)', () => {
    beforeEach(() => updateStudy.mockClear());

    it('sair do campo sem mudar o valor não grava', async () => {
        const user = userEvent.setup();
        render(<ImovibReceitasForm study={estudo} onDataChanged={vi.fn()} />);
        await user.click(screen.getByLabelText('Sinal / ato'));
        await user.tab();
        expect(updateStudy).not.toHaveBeenCalled();
    });

    it('trocar o tipo da curva grava sales_curve_type', async () => {
        const user = userEvent.setup();
        render(<ImovibReceitasForm study={estudo} onDataChanged={vi.fn()} />);
        await user.selectOptions(screen.getByLabelText('Tipo da curva'), 'vso');
        expect(updateStudy).toHaveBeenCalledWith('estudo-1', { sales_curve_type: 'vso' });
    });

    it('curva VSO sem VSO da região: o botão fica desligado e diz por quê; com ela, grava', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<ImovibReceitasForm study={{ ...(estudo as object), sales_curve_type: 'vso' } as never} onDataChanged={vi.fn()} />);
        const desligado = screen.getByRole('button', { name: 'Usar a VSO da região' });
        expect(desligado).toBeDisabled();
        expect(desligado).toHaveAttribute('title', 'Preencha a VSO histórica da região em Premissas › Mercado.');
        unmount();

        render(<ImovibReceitasForm study={{ ...(estudo as object), sales_curve_type: 'vso', vso_regional_percent: 4.5 } as never} onDataChanged={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Usar a VSO da região (4,5%)' }));
        expect(updateStudy).toHaveBeenCalledWith('estudo-1', { sales_vso_percent: 4.5 });
    });

    it('pós-chaves só pede prazo e juro quando tem percentual', () => {
        const { unmount } = render(<ImovibReceitasForm study={estudo} onDataChanged={vi.fn()} />);
        expect(screen.queryByLabelText('Prazo do pós-chaves')).toBeNull();
        unmount();
        render(<ImovibReceitasForm study={{ ...(estudo as object), revenue_post_handover_percent: 10 } as never} onDataChanged={vi.fn()} />);
        expect(screen.getByLabelText('Prazo do pós-chaves')).toBeInTheDocument();
        expect(screen.getByLabelText('Juro do pós-chaves')).toBeInTheDocument();
    });
});

describe('ImovibReceitasForm — pesos da curva personalizada', () => {
    beforeEach(() => updateStudy.mockClear());

    it('recarga do estudo durante a digitação não apaga o peso que está sendo digitado', async () => {
        const user = userEvent.setup();
        const base = { ...(estudo as object), sales_curve_type: 'custom', sales_duration_months: 3, sales_start_month: 1, sales_curve_custom: [0, 0, 0] };
        const { rerender } = render(<ImovibReceitasForm study={base as never} onDataChanged={vi.fn()} />);
        const mes2 = screen.getByLabelText('Peso do mês 2') as HTMLInputElement;
        await user.clear(mes2);
        await user.type(mes2, '3');
        // Chega a recarga de uma gravação anterior (mês 1 = 5) enquanto o mês 2 está sendo digitado.
        rerender(<ImovibReceitasForm study={{ ...base, sales_curve_custom: [5, 0, 0] } as never} onDataChanged={vi.fn()} />);
        expect(mes2.value).toBe('3');
        await user.tab();
        expect(updateStudy).toHaveBeenCalledWith('estudo-1', { sales_curve_custom: [5, 3, 0] });
    });
});
