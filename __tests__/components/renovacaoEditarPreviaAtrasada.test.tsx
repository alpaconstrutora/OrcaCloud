// @vitest-environment jsdom
/**
 * Gaveta de renovação (Gestão de Unidades › Renovações — plano
 * docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md, item 1).
 *
 * Origem (#739, conferido em produção em 25/11/2026, CTL-006): o formulário
 * em edição do AD-002 (até 22/09/2021) mostrava fim 22/09/2022 — uma prévia
 * atrasada trocava o fim pelo padrão de +12 meses. Agora só vale a prévia do
 * último pedido, e o preenchimento automático só toca campo vazio.
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const AD2 = {
    id: 'ad2', contract_id: 'c1', number: 'AD-002', status: 'Aprovado', type: 'Prazo', description: '', value_impact: 0,
    new_start_date: '2019-03-23', new_end_date: '2021-09-22', previous_end_date: '2019-03-22',
    new_value: 4784.92, previous_value: 4784.92, created_at: '2026-11-25T12:00:00Z',
};
const CONTRATO = {
    id: 'c1', number: 'CTL-006-012-0001', status: 'Ativo', start_date: '2016-09-23', end_date: '2021-09-22',
    current_value: 4784.92, original_value: 4556, billing_cycle: 'Mensal', due_day: 10, reajuste_index: 'IGP-M',
};
const previa = (endDate: string, startDate = '2021-09-23', parcelas = 12) => ({
    parent: CONTRATO, startDate, endDate, months: 12,
    currentValue: 4784.92, newValue: 4784.92, fator: 1, pendingToCancel: 0, nextNumber: 'CTL-006-012-0002',
    mode: 'ADITIVO', installmentsToGenerate: parcelas, firstInstallmentDate: '2021-11-10', seriesDueDay: 10, nextAddendumNumber: 'AD-003',
});

// Prévias controladas pelo teste: cada chamada fica presa até ser solta.
let pendentes: Array<{ opts: { endDate?: string; substituindo?: unknown }; soltar: (p: unknown) => void }> = [];
const previewRenewal = vi.fn((_id: string, opts: { endDate?: string; substituindo?: unknown }) =>
    new Promise(r => { pendentes.push({ opts, soltar: r }); }));
vi.mock('../../services/contractRenewalService', async (original) => ({
    ...(await original<typeof import('../../services/contractRenewalService')>()),
    contractRenewalService: { previewRenewal: (...a: [string, { endDate?: string }]) => previewRenewal(...a) },
}));
vi.mock('../../services/contractService', () => ({
    contractService: { getAddendumById: vi.fn(async () => AD2), listAddendums: vi.fn(async () => [AD2]) },
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import RenovacaoSheet from '../../components/rentals/RenovacaoSheet';

const montar = (editarAditivoId?: string) => render(
    <ConfirmProvider>
        <RenovacaoSheet contractId="c1" editarAditivoId={editarAditivoId} onClose={() => {}} onDone={() => {}} />
    </ConfirmProvider>,
);
const fim = () => (document.getElementById('renovacao-fim') as HTMLInputElement).value;

beforeEach(() => { pendentes = []; previewRenewal.mockClear(); });

describe('Gaveta de renovação — prévia atrasada', () => {
    it('Nova renovação: resposta velha não troca o fim digitado nem a prévia', async () => {
        montar();
        await waitFor(() => expect(pendentes).toHaveLength(1));       // prévia de abertura, presa
        fireEvent.change(document.getElementById('renovacao-fim')!, { target: { value: '2023-03-22' } });
        await waitFor(() => expect(pendentes).toHaveLength(2));
        await act(async () => { pendentes[1].soltar(previa('2023-03-22', '2021-09-23', 18)); });
        await act(async () => { pendentes[0].soltar(previa('2022-09-22')); }); // a velha chega depois

        expect(fim()).toBe('2023-03-22');
        expect(screen.getByText(/terminar em 22\/03\/2023/)).toBeTruthy();
        // a prévia que vale é a do último pedido (18 parcelas), não a velha (12)
        expect(screen.getByText(/serão geradas\s+18 parcela/)).toBeTruthy();
    });

    it('Editar o AD-002: o fim do aditivo fica (a prévia não o troca pelo padrão)', async () => {
        montar('ad2');
        await screen.findByText('Editar renovação AD-002');
        await waitFor(() => expect(pendentes).toHaveLength(1));
        expect(pendentes[0].opts.substituindo).toMatchObject({ id: 'ad2' });
        expect(fim()).toBe('2021-09-22');

        await act(async () => { pendentes[0].soltar(previa('2022-09-22', '2019-03-23')); });

        expect(fim()).toBe('2021-09-22');
        expect(screen.getByText(/O AD-002 será/)).toBeTruthy();
        // Editar é sempre aditivo: sem a escolha da via.
        expect(screen.queryByRole('radiogroup')).toBeNull();
    });
});
