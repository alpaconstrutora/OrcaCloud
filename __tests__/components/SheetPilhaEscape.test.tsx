import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * `ui/sheet.tsx` — Esc fecha SÓ o Sheet do topo, e o topo é o último ABERTO.
 *
 * 15/10/2026: com o seletor de sistema predial aberto por cima do "Novo item do
 * plano", cadastrar um sistema re-renderizava o pai; o `onClose` inline do
 * formulário ganhava identidade nova, o efeito da pilha rodava de novo e
 * recolocava o formulário no TOPO. O Esc seguinte fechava a gaveta de baixo e
 * deixava o seletor aberto.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Sheet } from '../../components/ui/sheet';
import { ConfirmProvider } from '../../components/ui/confirm';

function Cena({ fecharFora, fecharDentro, tick, seletor }: { fecharFora: () => void; fecharDentro: () => void; tick: number; seletor: boolean }) {
    return (
        <ConfirmProvider>
            {/* onClose inline, como quase todo chamador: identidade nova a cada render */}
            <Sheet open onClose={() => fecharFora()}>
                <span>formulário {tick}</span>
                <Sheet open={seletor} onClose={() => fecharDentro()} zIndex={150}>
                    <span>seletor</span>
                </Sheet>
            </Sheet>
        </ConfirmProvider>
    );
}

describe('Sheet — pilha do Esc', () => {
    it('re-render do pai não tira o seletor do topo', () => {
        const fora = vi.fn();
        const dentro = vi.fn();
        // O formulário abre primeiro; o seletor, depois (clique no campo).
        const { rerender } = render(<Cena fecharFora={fora} fecharDentro={dentro} tick={0} seletor={false} />);
        rerender(<Cena fecharFora={fora} fecharDentro={dentro} tick={1} seletor />);
        // O pai re-renderiza com o seletor aberto (ex.: a lista de sistemas mudou).
        rerender(<Cena fecharFora={fora} fecharDentro={dentro} tick={2} seletor />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(dentro).toHaveBeenCalledTimes(1);
        expect(fora).not.toHaveBeenCalled();
    });
});
