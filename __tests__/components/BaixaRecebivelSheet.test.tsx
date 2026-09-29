// @vitest-environment jsdom
/**
 * Painel de baixa — genérico desde 28/09/2026 (Receber e Pagar). O que não pode
 * mudar para Contas a Receber: rótulos e comportamento. E o painel não pode
 * zerar o que o usuário preencheu só porque quem chama mapeia a lista a cada
 * render (Receber agora passa `baixando.map(tituloDeRecebivel)`).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

// O Sheet usa useConfirm (guarda de saída com `dirty`).
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import BaixaRecebivelSheet, { type TituloDaBaixa } from '../../components/financeiro/BaixaRecebivelSheet';

const titulo = (): TituloDaBaixa[] => [{ id: 'r1', contraparte: 'Ivana Braga', descricao: 'Parcela 3', vencimento: '2026-09-10', valor: 500 }];

describe('BaixaRecebivelSheet', () => {
    it('sem `tipo` continua sendo o painel de Contas a Receber', () => {
        render(<BaixaRecebivelSheet titulos={titulo()} onClose={() => {}} onConfirm={async () => {}} />);
        expect(screen.getByRole('button', { name: 'Confirmar recebimento' })).toBeInTheDocument();
        expect(screen.getByText('Pagador')).toBeInTheDocument();
        expect(screen.getByText('Ivana Braga')).toBeInTheDocument();
        expect((screen.getByRole('checkbox', { name: /Emitir recibo/ }) as HTMLInputElement).checked).toBe(true);
    });

    it('array novo com os MESMOS títulos não zera a forma escolhida', () => {
        const props = { onClose: () => {}, onConfirm: async () => {} };
        const { rerender } = render(<BaixaRecebivelSheet titulos={titulo()} {...props} />);
        fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'PIX' } });
        rerender(<BaixaRecebivelSheet titulos={titulo()} {...props} />);
        expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('PIX');
    });

    it('confirma com data, forma e recibo', async () => {
        const onConfirm = vi.fn(async () => {});
        render(<BaixaRecebivelSheet titulos={titulo()} onClose={() => {}} onConfirm={onConfirm} />);
        fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'TED' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'TED', emitirRecibo: true })));
    });
});
