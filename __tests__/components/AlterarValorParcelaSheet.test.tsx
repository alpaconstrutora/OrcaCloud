// @vitest-environment jsdom
/**
 * Suprimentos › Contratos › Financeiro › Parcelas › Alterar valor (19/10/2026).
 * O painel diz por que o botão está desligado, grava o valor digitado e mostra
 * quem alterou a parcela antes.
 * Plano: docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/confirm';
import AlterarValorParcelaSheet, { descreverAlteracaoManual } from '../../components/contracts/AlterarValorParcelaSheet';
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
            <AlterarValorParcelaSheet parcela={p} onClose={() => {}} onSalvar={onSalvar} />
        </ConfirmProvider>,
    );
    return onSalvar;
};

describe('AlterarValorParcelaSheet', () => {
    it('sem mudança, "Salvar valor" fica desligado e diz o motivo', () => {
        abrir(parcela);
        const botao = screen.getByRole('button', { name: /salvar valor/i });
        expect(botao).toBeDisabled();
        expect(botao.parentElement?.getAttribute('title')).toMatch(/mesmo da parcela/);
    });

    it('grava o novo valor digitado (centavos)', async () => {
        const onSalvar = abrir(parcela);
        fireEvent.change(screen.getByLabelText(/novo valor/i), { target: { value: '135000' } });
        const botao = screen.getByRole('button', { name: /salvar valor/i });
        expect(botao).not.toBeDisabled();
        fireEvent.click(botao);
        await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(parcela, 1350));
    });

    it('parcela já alterada mostra quem, quando e o valor gerado pelo contrato', () => {
        const alterada: ParcelaDoContrato = {
            ...parcela, amount: 1350, valor_manual: true, valor_manual_anterior: 1000,
            valor_manual_em: '2026-10-19T17:32:00Z', valor_manual_por_nome: 'Fulana',
        };
        abrir(alterada);
        expect(screen.getByText(/Alterado manualmente por Fulana em/)).toBeTruthy();
        expect(descreverAlteracaoManual(alterada)).toMatch(/valor gerado pelo contrato: R\$\s?1\.000,00/);
        expect(descreverAlteracaoManual(parcela)).toBeNull();
    });
});
