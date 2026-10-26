// @vitest-environment jsdom
/**
 * Contrato › Financeiro › Parcelas › "Corrigir divergência" com o caso real
 * CTS-042-0001 (Atual R$ 2.850, parcelas R$ 2.700, aditivo AD-001 +R$ 150).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ aplicar: vi.fn(), ajustar: vi.fn() }));
vi.mock('../../services/contractService', () => ({
    contractService: { aplicarCronogramaCorrigido: m.aplicar, ajustarValorDoContrato: m.ajustar },
}));
const asaas = vi.hoisted(() => ({ byTransactions: vi.fn(async () => ({})) }));
vi.mock('../../services/supplierPaymentService', () => ({ supplierPaymentService: asaas }));

import CorrigirDivergenciaSheet from '../../components/contracts/CorrigirDivergenciaSheet';
import { ConfirmProvider } from '../../components/ui/confirm';
import { conferirParcelas } from '../../utils/conferenciaParcelasContrato';
import type { Contract, ContractAddendum } from '../../types/contracts';
import type { ParcelaDoContrato } from '../../services/contractService';

const contrato = {
    id: 'c1', organization_id: 'o1', is_recurring: false, payment_term_type: 'Parcelado',
    original_value: 2700, current_value: 2850,
    payment_schedule: [{ date: '2026-05-11', value: 1000 }, { date: '2026-06-11', value: 1700 }],
} as unknown as Contract;
const parcela = (n: number, v: number) => ({
    id: `t${n}`, source_system: 'CONTRACT_PARCELADO', reference_id: `c1:p${n}`, transaction_date: n === 1 ? '2026-05-11' : '2026-06-11',
    amount: v, direction: 'DEBIT', description: null, category: null, status: 'PENDING', business_status: 'PREVISTO',
}) as unknown as ParcelaDoContrato;
const parcelas = [parcela(1, 1000), parcela(2, 1700)];
const aditivos = [{ id: 'a1', contract_id: 'c1', number: 'AD-001', type: 'Ambos', description: 'Pintura Interna', value_impact: 150, status: 'Aprovado' }] as unknown as ContractAddendum[];
const conferencia = conferirParcelas(contrato, parcelas, aditivos.map(a => ({ number: a.number, value_impact: a.value_impact, status: a.status })));

const abrir = (onAplicado = vi.fn(async () => {}), lista = parcelas) => {
    render(<ConfirmProvider><CorrigirDivergenciaSheet open contrato={contrato} conferencia={conferencia} parcelas={lista} aditivos={aditivos} onClose={() => {}} onAplicado={onAplicado} /></ConfirmProvider>);
    return onAplicado;
};

describe('CorrigirDivergenciaSheet', () => {
    beforeEach(() => { m.aplicar.mockReset(); m.ajustar.mockReset(); asaas.byTransactions.mockImplementation(async () => ({})); });

    it('abre no "lançar a diferença", aponta o AD-001 e mostra a parcela nova de R$ 150', () => {
        abrir();
        expect(screen.getByText(/Faltam R\$ 150,00 em parcelas/)).toBeTruthy();
        expect(screen.getByText(/AD-001 \(R\$ 150,00\)/)).toBeTruthy();
        expect(screen.getByText(/R\$ 150,00 \(nova\)/)).toBeTruthy();
        expect(screen.getByText('Soma das parcelas passa a R$ 2.850,00.')).toBeTruthy();
    });

    it('grava o complemento pelo serviço com o cronograma de 3 linhas', async () => {
        m.aplicar.mockResolvedValue({ ...contrato });
        const onAplicado = abrir();
        await waitFor(() => expect((screen.getByRole('button', { name: /Aplicar correção/ }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /Aplicar correção/ }));
        await waitFor(() => expect(onAplicado).toHaveBeenCalled());
        const [, cronograma, reescritas] = m.aplicar.mock.calls[0];
        expect(cronograma.map((l: { value: number }) => l.value)).toEqual([1000, 1700, 150]);
        expect(reescritas).toEqual([]);
    });

    it('"Ajustar o valor do contrato" mostra Original 2.700 → 2.550 e Atual 2.850 → 2.700', () => {
        abrir();
        fireEvent.click(screen.getByLabelText(/Ajustar o valor do contrato/));
        expect(screen.getByText('R$ 2.550,00')).toBeTruthy();
        expect(screen.getByText('R$ 2.700,00')).toBeTruthy();
    });

    it('o botão espera a checagem dos pagamentos Asaas antes de gravar', async () => {
        let soltar: (v: Record<string, unknown>) => void = () => {};
        asaas.byTransactions.mockImplementation(() => new Promise(r => { soltar = r; }));
        abrir();
        const botao = screen.getByRole('button', { name: /Aplicar correção/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(screen.getByTitle(/Verificando os pagamentos Asaas/)).toBeTruthy();
        soltar({});
        await waitFor(() => expect((screen.getByRole('button', { name: /Aplicar correção/ }) as HTMLButtonElement).disabled).toBe(false));
    });

    it('contrato a receber diz Contas a Receber (a alçada é só do que se paga)', async () => {
        m.aplicar.mockResolvedValue({ ...contrato });
        const aReceber = parcelas.map(p => ({ ...p, direction: 'CREDIT' })) as unknown as ParcelaDoContrato[];
        const onAplicado = abrir(vi.fn(async () => {}), aReceber);
        await waitFor(() => expect((screen.getByRole('button', { name: /Aplicar correção/ }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /Aplicar correção/ }));
        await waitFor(() => expect(onAplicado).toHaveBeenCalled());
        expect(onAplicado.mock.calls[0][1]).toMatch(/Contas a Receber/);
    });
});
