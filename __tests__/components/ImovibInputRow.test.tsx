// @vitest-environment jsdom
/**
 * ImovibInputRow (Fase 1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md,
 * achado 4 da revisão): sem `onChange`, sair do campo mostrava de volta o valor
 * antigo do pai até a recarga chegar — o usuário via 0 e achava que não gravou.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import ImovibInputRow from '../../components/ImovibInputRow';

describe('ImovibInputRow', () => {
    it('sem onChange, o valor digitado continua no campo depois do blur', async () => {
        const user = userEvent.setup();
        const onCommit = vi.fn();
        render(<ImovibInputRow label="Permuta física" value={0} onCommit={onCommit} />);
        const campo = screen.getByLabelText('Permuta física') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '60');
        await user.tab();
        expect(onCommit).toHaveBeenCalledWith(60);
        expect(campo.value).toBe('60');
    });

    it('quando o valor do pai muda (recarga), o campo mostra o novo', () => {
        const { rerender } = render(<ImovibInputRow label="Distrato" value={5} onCommit={vi.fn()} />);
        rerender(<ImovibInputRow label="Distrato" value={8} onCommit={vi.fn()} />);
        expect((screen.getByLabelText('Distrato') as HTMLInputElement).value).toBe('8');
    });

    it('recarga que chega durante a digitação não apaga o que está sendo digitado', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ImovibInputRow label="Distrato" value={5} onCommit={vi.fn()} />);
        const campo = screen.getByLabelText('Distrato') as HTMLInputElement;
        await user.clear(campo);
        await user.type(campo, '7');
        rerender(<ImovibInputRow label="Distrato" value={6} onCommit={vi.fn()} />);
        expect(campo.value).toBe('7');
    });
});
