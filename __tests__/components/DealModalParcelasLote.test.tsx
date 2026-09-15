// @vitest-environment jsdom
/**
 * Venda de Ativos › aba Parcelas › "Editar em Lote" (15/09/2026).
 * Pedido: "incluir no modal edicao em lote todas as colunas da tabela" e, na
 * cobrança seguinte, "por que deixou de fora plano de contas e centro de custo".
 *
 * A tabela tem 11 colunas. O modal cobria só Desconto, Tipo e Forma de
 * pagamento. Estes casos travam:
 *   1. todas as colunas aparecem no modal — as editáveis por parcela como
 *      campo (Vencimento, Valor, Desconto, Tipo, Forma de pagamento, Centro de
 *      Custo, Plano de Contas, Descrição); Cliente (do negócio) como leitura;
 *      Origem e Valor final entram na prévia por linha;
 *   2. tudo nasce em "Não alterar" e Aplicar fica desabilitado até algo mudar;
 *   3. o patch só carrega o que o usuário escolheu — quem troca a descrição não
 *      manda desconto (era isso que apagava o desconto em lote);
 *   4. "deslocar" o vencimento parte da data de CADA parcela (não colapsa tudo
 *      num dia) e a prévia mostra a data nova;
 *   5. Centro de Custo e Plano de Contas saem no patch como id (definir) ou
 *      null (limpar) — são dimensões DA LINHA, o que Contas a Receber mostra.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { InstallmentLoteEditModal, aplicarBulkDueDate, type InstallmentLotePatch } from '../../components/DealModal';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { PaymentInstallment, PaymentType, CostCenter } from '../../types';

const PARCELAS: (PaymentInstallment & { origem?: string })[] = [
    { id: 'p1', dueDate: '2026-10-10', value: 900, originalValue: 1000, discountType: 'VALUE', discountAmount: 100, status: 'PENDING', description: 'Parcela 1/3', origem: 'Negociação' },
    { id: 'p2', dueDate: '2026-11-10', value: 1000, status: 'PENDING', description: 'Parcela 2/3', origem: 'Negociação' },
    { id: 'p3', dueDate: '2026-12-31', value: 1000, status: 'PENDING', description: 'Parcela 3/3', origem: 'Contrato 12' },
];

const TIPOS: PaymentType[] = [
    { id: 't1', name: 'Mensal', code: 'MENSAL', interval_months: 1, generates_series: true, active: true },
    { id: 't2', name: 'Chaves', code: 'CHAVES', interval_months: 0, generates_series: false, active: true },
];

const CCS: CostCenter[] = [
    { id: 'cc-1', organization_id: 'org', name: 'Torre A', code: '01' },
    { id: 'cc-2', organization_id: 'org', name: 'Torre B', code: '02' },
];
const PCS: CostCenter[] = [
    { id: 'pc-1', organization_id: 'org', name: 'Receita de vendas', code: '3.1' },
    { id: 'pc-2', organization_id: 'org', name: 'Receita de locação', code: '3.2' },
];

function montar() {
    const onSave = vi.fn<(p: InstallmentLotePatch) => void>();
    const onClose = vi.fn();
    // O drawer de Centro de Custo / Plano de Contas (Sheet) usa useConfirm —
    // o provider vem do root do app; aqui é montado à mão.
    render(
        <ConfirmProvider>
            <InstallmentLoteEditModal
                installments={PARCELAS}
                installmentTypes={TIPOS}
                clienteLabel="Maria Silva"
                costCenters={CCS}
                planoContas={PCS}
                onClose={onClose}
                onSave={onSave}
            />
        </ConfirmProvider>
    );
    const aplicar = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement;
    return { onSave, onClose, aplicar };
}

// Campos com select de modo. Centro de Custo / Plano de Contas NÃO estão aqui:
// são o drawer padrão do app direto no campo (§7.1.1), sem select na frente.
const CAMPOS = ['Vencimento', 'Valor (bruto)', 'Desconto', 'Tipo', 'Forma de pagamento', 'Descrição'];

describe('InstallmentLoteEditModal — todas as colunas da tabela', () => {
    it('mostra um campo por coluna editável e o cliente como leitura', () => {
        montar();
        for (const rotulo of CAMPOS) {
            expect(screen.getByLabelText(rotulo)).toBeTruthy();
        }
        // CC / Plano: gatilho do drawer (aria-haspopup=dialog), nunca <select>.
        const gatilhos = screen.getAllByRole('button', { name: /^Não alterar$/ });
        expect(gatilhos).toHaveLength(2);
        for (const g of gatilhos) expect(g.getAttribute('aria-haspopup')).toBe('dialog');
        expect(screen.queryByRole('combobox', { name: /Centro de Custo|Plano de Contas/ })).toBeNull();
        expect(screen.getByText('Maria Silva')).toBeTruthy();
        expect(screen.getByText(/use a aba Dados do Cliente/i)).toBeTruthy();
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
        expect(patch.costCenterId).toBeUndefined();
        expect(patch.planoContasId).toBeUndefined();
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

    it('centro de custo e plano de contas: escolher no drawer manda o id; vazio = não alterar', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        const [gatilhoCc, gatilhoPc] = screen.getAllByRole('button', { name: /^Não alterar$/ });

        await user.click(gatilhoCc);
        fireEvent.mouseDown(screen.getByText('Torre B'));
        expect(aplicar.disabled).toBe(false);
        expect(gatilhoCc.textContent).toContain('Torre B'); // o gatilho passa a mostrar a escolha

        await user.click(gatilhoPc);
        fireEvent.mouseDown(screen.getByText('Receita de locação'));

        await user.click(aplicar);
        const patch = onSave.mock.calls[0][0];
        expect(patch.costCenterId).toBe('cc-2');
        expect(patch.planoContasId).toBe('pc-2');
        expect(patch.discountType).toBeUndefined();
    });

    it('só o centro de custo escolhido vai no patch; plano de contas vazio fica undefined', async () => {
        const user = userEvent.setup();
        const { onSave, aplicar } = montar();
        const [gatilhoCc] = screen.getAllByRole('button', { name: /^Não alterar$/ });
        await user.click(gatilhoCc);
        fireEvent.mouseDown(screen.getByText('Torre A'));
        await user.click(aplicar);
        const patch = onSave.mock.calls[0][0];
        expect(patch.costCenterId).toBe('cc-1');
        expect(patch.planoContasId).toBeUndefined();
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
