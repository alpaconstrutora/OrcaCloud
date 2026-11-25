// @vitest-environment jsdom
/**
 * Editar renovação (#737) — conferido em produção, 25/11/2026, CTL-006: o
 * formulário em edição do AD-002 (vigência até 22/09/2021) mostrava fim
 * 22/09/2022. A prévia da "Nova renovação", pedida ao abrir o painel, chegava
 * DEPOIS de Editar preencher o formulário e trocava o fim pelo padrão (+12 meses).
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
// jsdom não tem scrollIntoView (Editar rola até o formulário).
Element.prototype.scrollIntoView = vi.fn();

const AD2 = {
    id: 'ad2', contract_id: 'c1', number: 'AD-002', status: 'Aprovado', type: 'Prazo', description: '', value_impact: 0,
    new_start_date: '2019-03-23', new_end_date: '2021-09-22', previous_end_date: '2019-03-22',
    new_value: 4784.92, previous_value: 4784.92, created_at: '2026-11-25T12:00:00Z',
};
const CONTRATO = {
    id: 'c1', number: 'CTL-006-012-0001', status: 'Ativo', start_date: '2016-09-23', end_date: '2021-09-22',
    current_value: 4784.92, original_value: 4556, billing_cycle: 'Mensal', due_day: 10, reajuste_index: 'IGP-M',
};
const previa = (endDate: string) => ({
    parent: CONTRATO, startDate: endDate === '2022-09-22' ? '2021-09-23' : '2019-03-23', endDate, months: 12,
    currentValue: 4784.92, newValue: 4784.92, fator: 1, pendingToCancel: 0, nextNumber: 'CTL-006-012-0002',
    mode: 'ADITIVO', installmentsToGenerate: 30, firstInstallmentDate: '2019-05-10', seriesDueDay: 10, nextAddendumNumber: 'AD-003',
});

// A 1ª prévia (sem `substituindo`, a da Nova renovação) fica presa até o teste soltar.
let soltarPrimeira: () => void = () => {};
vi.mock('../../services/contractRenewalService', async (original) => ({
    ...(await original<typeof import('../../services/contractRenewalService')>()),
    contractRenewalService: {
        getRenewalChain: vi.fn(async () => [CONTRATO]),
        previewRenewal: vi.fn((_id: string, opts: { substituindo?: unknown }) => opts.substituindo
            ? Promise.resolve(previa('2021-09-22'))
            : new Promise(r => { soltarPrimeira = () => r(previa('2022-09-22')); })),
    },
}));
vi.mock('../../services/contractService', () => ({
    contractService: { listAddendums: vi.fn(async () => [AD2]) },
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import ContractRenewalsPanel from '../../components/rentals/ContractRenewalsPanel';
import type { Contract } from '../../types';

describe('Editar renovação — prévia atrasada da Nova renovação', () => {
    it('não troca o fim do aditivo em edição pelo padrão de +12 meses', async () => {
        render(
            <ConfirmProvider>
                <ContractRenewalsPanel contract={CONTRATO as unknown as Contract} onNotify={() => {}} editarAditivoId="ad2" />
            </ConfirmProvider>,
        );
        await screen.findByText('Editar renovação AD-002');
        const fim = () => (document.getElementById('renovacao-fim') as HTMLInputElement).value;
        await waitFor(() => expect(fim()).toBe('2021-09-22'));

        await act(async () => { soltarPrimeira(); });

        expect(fim()).toBe('2021-09-22');
        expect(screen.getByText(/O AD-002 será/)).toBeTruthy();
    });
});
