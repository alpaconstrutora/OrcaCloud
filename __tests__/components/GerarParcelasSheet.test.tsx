// @vitest-environment jsdom
/**
 * Contrato › Financeiro › Parcelas › "Gerar parcelas" (plano
 * 2026-10-26-contrato-parcelas-menores-adiados, T2 — ponto adiado do PR #183).
 * Caso CTS-042-0001: Atual R$ 2.850; a 1ª parcela (R$ 1.000) já paga, a 2ª
 * (R$ 1.700) em aberto. O gerador mantém a paga e divide R$ 1.850 nas novas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ aplicar: vi.fn() }));
vi.mock('../../services/contractService', () => ({
    contractService: { aplicarCronogramaCorrigido: m.aplicar },
}));
const asaas = vi.hoisted(() => ({ byTransactions: vi.fn(async () => ({})) }));
vi.mock('../../services/supplierPaymentService', () => ({ supplierPaymentService: asaas }));

import GerarParcelasSheet from '../../components/contracts/GerarParcelasSheet';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { Contract } from '../../types/contracts';
import type { ParcelaDoContrato } from '../../services/contractService';

const contrato = {
    id: 'c1', organization_id: 'o1', is_recurring: false, payment_term_type: 'Parcelado',
    original_value: 2700, current_value: 2850,
    payment_schedule: [{ date: '2026-05-11', value: 1000 }, { date: '2026-06-11', value: 1700 }],
} as unknown as Contract;
const parcela = (n: number, v: number, extra: Record<string, unknown> = {}) => ({
    id: `t${n}`, source_system: 'CONTRACT_PARCELADO', reference_id: `c1:p${n}`, transaction_date: n === 1 ? '2026-05-11' : '2026-06-11',
    amount: v, direction: 'DEBIT', description: null, category: null, status: 'PENDING', business_status: 'PREVISTO', ...extra,
}) as unknown as ParcelaDoContrato;
const parcelas = [parcela(1, 1000, { status: 'CONCILIATED', business_status: 'PAGO' }), parcela(2, 1700)];

const abrir = (onAplicado = vi.fn(async () => {}), lista = parcelas) => {
    render(<ConfirmProvider><GerarParcelasSheet open contrato={contrato} valorContrato={2850} parcelas={lista} onClose={() => {}} onAplicado={onAplicado} /></ConfirmProvider>);
    fireEvent.change(screen.getByLabelText('Nº de parcelas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('1º vencimento'), { target: { value: '2026-11-10' } });
    return onAplicado;
};
const botaoGerar = () => screen.getByRole('button', { name: /Gerar parcelas/ }) as HTMLButtonElement;

describe('GerarParcelasSheet', () => {
    beforeEach(() => { m.aplicar.mockReset(); asaas.byTransactions.mockImplementation(async () => ({})); });

    it('a prévia mantém a paga e divide Atual − pago nas novas (centavos na última)', () => {
        abrir();
        expect(screen.getByText(/R\$ 2\.850,00 − pago R\$ 1\.000,00 = R\$ 1\.850,00 a parcelar/)).toBeTruthy();
        expect(screen.getByText(/1 parcela\(s\) paga\(s\) ficam como estão\. 1 em aberto serão substituídas\./)).toBeTruthy();
        expect(screen.getAllByText('R$ 616,66')).toHaveLength(2);
        expect(screen.getByText('R$ 616,68')).toBeTruthy();
    });

    it('grava pelo serviço: a paga fica, as 3 novas substituem a aberta', async () => {
        m.aplicar.mockResolvedValue({ ...contrato });
        const onAplicado = abrir();
        await waitFor(() => expect(botaoGerar().disabled).toBe(false));
        fireEvent.click(botaoGerar());
        await waitFor(() => expect(onAplicado).toHaveBeenCalled());
        const [, cronograma, reescritas] = m.aplicar.mock.calls[0];
        expect(cronograma.map((l: { value: number }) => l.value)).toEqual([1000, 616.66, 616.66, 616.68]);
        expect(cronograma[0].date).toBe('2026-05-11');
        expect(cronograma[1].date).toBe('2026-11-10');
        expect(reescritas).toEqual(['t2']);
        expect(onAplicado.mock.calls[0][1]).toMatch(/3 parcela\(s\) gerada\(s\) — elas entram em Contas a Pagar, aguardando aprovação/);
    });

    it('o botão espera a checagem dos pagamentos Asaas antes de gravar', async () => {
        let soltar: (v: Record<string, unknown>) => void = () => {};
        asaas.byTransactions.mockImplementation(() => new Promise(r => { soltar = r; }));
        abrir();
        expect(botaoGerar().disabled).toBe(true);
        expect(screen.getByTitle(/Verificando os pagamentos Asaas/)).toBeTruthy();
        soltar({});
        await waitFor(() => expect(botaoGerar().disabled).toBe(false));
    });

    it('entrada que cobre todo o saldo é recusada, com o motivo na tela', async () => {
        abrir();
        await waitFor(() => expect(botaoGerar().disabled).toBe(false));
        fireEvent.change(screen.getByLabelText('Entrada (opcional, R$)'), { target: { value: '185000' } });
        expect(botaoGerar().disabled).toBe(true);
        expect(screen.getByText(/A entrada cobre todo o saldo a parcelar/)).toBeTruthy();
        expect(m.aplicar).not.toHaveBeenCalled();
    });

    it('contrato a receber diz Contas a Receber (a alçada é só do que se paga)', async () => {
        m.aplicar.mockResolvedValue({ ...contrato });
        const aReceber = parcelas.map(p => ({ ...p, direction: 'CREDIT' })) as unknown as ParcelaDoContrato[];
        const onAplicado = abrir(vi.fn(async () => {}), aReceber);
        await waitFor(() => expect(botaoGerar().disabled).toBe(false));
        fireEvent.click(botaoGerar());
        await waitFor(() => expect(onAplicado).toHaveBeenCalled());
        expect(onAplicado.mock.calls[0][1]).toMatch(/Contas a Receber/);
    });
});
