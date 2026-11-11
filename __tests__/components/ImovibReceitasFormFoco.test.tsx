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

import ImovibFundingForm from '../../components/ImovibFundingForm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';

const estudo = { id: 'estudo-1', name: 'Teste', revenue_downpayment_percent: 10 } as never;

describe('ImovibFundingForm — digitar sem perder o foco', () => {
    beforeEach(() => updateStudy.mockClear());

    it('digitar "12.5" mantém o mesmo campo focado e grava só no blur', async () => {
        const user = userEvent.setup();
        render(<ImovibFundingForm study={estudo} onDataChanged={vi.fn()} />);

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

        // A soma do perfil de recebimento acompanha a digitação: 12,5 + 20 + 70.
        expect(screen.getByText('102.5%')).toBeInTheDocument();

        await user.tab();
        expect(updateStudy).toHaveBeenCalledTimes(1);
        expect(updateStudy).toHaveBeenCalledWith('estudo-1', { revenue_downpayment_percent: 12.5 });
    });

    it('só leitura: o campo continua desabilitado (fieldset imovib-ro)', () => {
        render(
            <ImovibEdicaoProvider value={{ pode: false, motivo: 'Sem permissão' }}>
                <ImovibFundingForm study={estudo} onDataChanged={vi.fn()} />
            </ImovibEdicaoProvider>,
        );
        expect(screen.getByLabelText('Sinal / Ato')).toBeDisabled();
    });
});
