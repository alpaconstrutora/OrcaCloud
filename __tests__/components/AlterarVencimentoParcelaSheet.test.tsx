// @vitest-environment jsdom
/**
 * Suprimentos › Contratos › Financeiro › Parcelas › Alterar vencimento (24/10/2026).
 * O painel diz por que o botão está desligado, grava a data escolhida e mostra
 * quem alterou o vencimento antes.
 * Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/confirm';
import AlterarVencimentoParcelaSheet, { descreverVencimentoManual } from '../../components/contracts/AlterarVencimentoParcelaSheet';
import type { ParcelaDoContrato } from '../../services/contractService';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const parcela: ParcelaDoContrato = {
    id: 't2', source_system: 'CONTRACT_PARCELADO', reference_id: 'c1:p2',
    transaction_date: '2026-11-10', amount: 1000, direction: 'DEBIT',
    description: 'Contrato: Empreita - Parcela 2/3', category: null, status: 'PENDING',
};

const abrir = (p: ParcelaDoContrato, onSalvar = vi.fn().mockResolvedValue(undefined)) => {
    render(
        <ConfirmProvider>
            <AlterarVencimentoParcelaSheet parcela={p} onClose={() => {}} onSalvar={onSalvar} />
        </ConfirmProvider>,
    );
    return onSalvar;
};

describe('AlterarVencimentoParcelaSheet', () => {
    it('abre com o vencimento atual; sem mudança, "Salvar vencimento" fica desligado e diz o motivo', () => {
        abrir(parcela);
        expect((screen.getByLabelText(/novo vencimento/i) as HTMLInputElement).value).toBe('2026-11-10');
        const botao = screen.getByRole('button', { name: /salvar vencimento/i });
        expect(botao).toBeDisabled();
        expect(botao.parentElement?.getAttribute('title')).toMatch(/mesma da parcela/);
    });

    it('data apagada: desligado, pedindo a data', () => {
        abrir(parcela);
        fireEvent.change(screen.getByLabelText(/novo vencimento/i), { target: { value: '' } });
        expect(screen.getByRole('button', { name: /salvar vencimento/i }).parentElement?.getAttribute('title'))
            .toMatch(/Informe a nova data/);
    });

    it('grava a data escolhida', async () => {
        const onSalvar = abrir(parcela);
        fireEvent.change(screen.getByLabelText(/novo vencimento/i), { target: { value: '2026-11-20' } });
        const botao = screen.getByRole('button', { name: /salvar vencimento/i });
        expect(botao).not.toBeDisabled();
        fireEvent.click(botao);
        await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(parcela, '2026-11-20'));
    });

    it('parcela já alterada mostra quem, quando e o vencimento gerado pelo contrato', () => {
        const alterada: ParcelaDoContrato = {
            ...parcela, transaction_date: '2026-11-20', vencimento_manual: true, vencimento_manual_anterior: '2026-11-10',
            vencimento_manual_em: '2026-10-24T17:32:00Z', vencimento_manual_por_nome: 'Fulana',
        };
        abrir(alterada);
        expect(screen.getByText(/Vencimento alterado manualmente por Fulana em/)).toBeTruthy();
        expect(descreverVencimentoManual(alterada)).toMatch(/vencimento gerado pelo contrato: 10\/11\/2026/);
        expect(descreverVencimentoManual(parcela)).toBeNull();
    });
});
