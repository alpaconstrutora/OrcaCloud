// @vitest-environment jsdom
/**
 * Venda de Ativos › aba Parcelas › "Editar em Lote" (15/09/2026).
 * Pedido: "incluir no modal edição em lote todas as colunas da tabela".
 *
 * A tabela tem 11 colunas. O modal cobria só Desconto, Tipo e Forma de
 * pagamento. Estes casos travam:
 *   1. todas as colunas aparecem no modal — as editáveis por parcela como
 *      campo (Vencimento, Valor, Desconto, Tipo, Forma de pagamento,
 *      Descrição) e as herdadas do negócio como leitura (Cliente, Centro de
 *      Custo, Plano de Contas); Origem e Valor final entram na prévia por linha;
 *   2. tudo nasce em "Não alterar" e Aplicar fica desabilitado até algo mudar;
 *   3. o patch só carrega o que o usuário escolheu — quem troca a descrição não
 *      manda desconto (era isso que apagava o desconto em lote);
 *   4. "deslocar" o vencimento parte da data de CADA parcela (não colapsa tudo
 *      num dia) e a prévia mostra a data nova.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { InstallmentLoteEditModal, aplicarBulkDueDate, type InstallmentLotePatch } from '../../components/DealModal';
import type { PaymentInstallment, PaymentType } from '../../types';

const PARCELAS: (PaymentInstallment & { origem?: string })[] = [
    { id: 'p1', dueDate: '2026-10-10', value: 900, originalValue: 1000, discountType: 'VALUE', discountAmount: 100, status: 'PENDING', description: 'Parcela 1/3', origem: 'Negociação' },
    { id: 'p2', dueDate: '2026-11-10', value: 1000, status: 'PENDING', description: 'Parcela 2/3', origem: 'Negociação' },
    { id: 'p3', dueDate: '2026-12-31', value: 1000, status: 'PENDING', description: 'Parcela 3/3', origem: 'Contrato 12' },
];

const TIPOS: PaymentType[] = [
    { id: 't1', name: 'Mensal', code: 'MENSAL', interval_months: 1, generates_series: true, active: true },
    { id: 't2', name: 'Chaves', code: 'CHAVES', interval_months: 0, generates_series: false, active: true },
];

function montar() {
    const onSave = vi.fn<(p: InstallmentLotePatch) => void>();
    const onClose = vi.fn();
    render(
        <InstallmentLoteEditModal
            installments={PARCELAS}
            installmentTypes={TIPOS}
            dimensoes={{ cliente: 'Maria Silva', centroCusto: 'CC-01 Torre A', planoContas: '1.1 Receita de vendas' }}
            onClose={onClose}
            onSave={onSave}
        />
    );
    const aplicar = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement;
    return { onSave, onClose, aplicar };
}

const CAMPOS = ['Vencimento', 'Valor (bruto)', 'Desconto', 'Tipo', 'Forma de pagamento', 'Descrição'];

describe('InstallmentLoteEditModal — todas as colunas da tabela', () => {
    it('mostra um campo por coluna editável e as herdadas como leitura', () => {
        montar();
        for (const rotulo of CAMPOS) {
            expect(screen.getByLabelText(rotulo)).toBeTruthy();
        }
        expect(screen.getByText('Maria Silva')).toBeTruthy();
        expect(screen.getByText('CC-01 Torre A')).toBeTruthy();
        expect(screen.getByText('1.1 Receita de vendas')).toBeTruthy();
        expect(screen.getByText(/use a aba Financeiro/i)).toBeTruthy();
        expect(screen.getByText(/Contrato 12/)).toBeTruthy();
        expect(screen.getByText(/final R\$\s?900,00/)).toBeTruthy();
    });

    it('nasce em "Não alterar" em tudo e Aplicar desabilitado', () => {
        const { aplicar } = montar();
        expect(aplicar.disabled).toBe(true);
        for (const rotulo of CAMPOS) {
            expect((screen.getByLabelText(rotulo) as HTMLSelectElement).value).toBe('__KEEP__');
        }
    });

    it('trocar só a descrição manda só a descrição (desconto fica intacto)', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        await user.selectOptions(screen.getByLabelText('Descrição'), 'SET');
        expect(aplicar.disabled).toBe(true);
        await user.type(screen.getByLabelText('Texto'), '  Parcela do imóvel 101 ');
        expect(aplicar.disabled).toBe(false);
        await user.click(aplicar);
        expect(onSave).toHaveBeenCalledTimes(1);
        const patch = onSave.mock.calls[0][0];
        expect(patch.description).toBe('Parcela do imóvel 101');
        expect(patch.dueDate).toBeUndefined();
        expect(patch.amount).toBeUndefined();
        expect(patch.discountType).toBeUndefined();
        expect(patch.paymentType).toBeUndefined();
        expect(patch.installmentType).toBeUndefined();
    });

    it('valor, tipo e forma de pagamento saem no patch com o valor escolhido', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        await user.selectOptions(screen.getByLabelText('Valor (bruto)'), 'SET');
        await user.type(screen.getByLabelText('Novo valor (R$)'), '2500.5');
        await user.selectOptions(screen.getByLabelText('Tipo'), 'CHAVES');
        await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'PIX');
        await user.click(aplicar);
        const patch = onSave.mock.calls[0][0];
        expect(patch.amount).toBe(2500.5);
        expect(patch.installmentType).toBe('CHAVES');
        expect(patch.paymentType).toBe('PIX');
        expect(patch.description).toBeUndefined();
    });

    it('deslocar vencimento em dias parte de cada parcela e a prévia mostra a data nova', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        await user.selectOptions(screen.getByLabelText('Vencimento'), 'SHIFT_DAYS');
        expect(aplicar.disabled).toBe(true);
        await user.type(screen.getByLabelText(/^Dias/), '5');
        expect(screen.getByText('15/10/2026')).toBeTruthy();
        expect(screen.getByText('05/01/2027')).toBeTruthy();
        await user.click(aplicar);
        expect(onSave.mock.calls[0][0].dueDate).toEqual({ mode: 'SHIFT_DAYS', days: 5 });
    });

    it('mesma data em todas exige uma data válida', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        await user.selectOptions(screen.getByLabelText('Vencimento'), 'SET');
        expect(aplicar.disabled).toBe(true);
        await user.type(screen.getByLabelText('Nova data'), '2027-01-15');
        await user.click(aplicar);
        expect(onSave.mock.calls[0][0].dueDate).toEqual({ mode: 'SET', value: '2027-01-15' });
    });

    it('Cancelar chama onClose sem salvar', async () => {
        const user = userEvent.setup();
        const { onSave, onClose } = montar();
        await user.click(screen.getByRole('button', { name: /cancelar/i }));
        expect(onClose).toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    });
});

describe('aplicarBulkDueDate', () => {
    it('resolve os três modos a partir da data da parcela', () => {
        expect(aplicarBulkDueDate('2026-10-10', { mode: 'SET', value: '2027-01-15' })).toBe('2027-01-15');
        expect(aplicarBulkDueDate('2026-10-10', { mode: 'SHIFT_DAYS', days: -7 })).toBe('2026-10-03');
        expect(aplicarBulkDueDate('2026-01-31', { mode: 'SHIFT_MONTHS', months: 1 })).toBe('2026-02-28');
    });
});
