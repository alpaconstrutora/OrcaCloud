// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    renderPendingInternalCell, PENDING_INTERNAL_COLUMNS, PENDING_INTERNAL_COLUMN_HEADERS,
    type PendingInternalRowCtx,
} from '../../components/reconciliation/tabelasDaConciliacao';
import { chaveDaSequencia } from '../../components/reconciliation/CelulaSequencia';
import type { InternalTransaction } from '../../types';
import type { PosicaoNaSerie } from '../../utils/sequenciaParcelas';

// Pendentes › Lançamentos Internos: coluna "Sequência sugerida" (pedido de 24/11/2026),
// a mesma célula da Central.

const tx = (id: string, contract_id: string | null = 'c1') => ({
    id, organization_id: 'o1', source_system: 'CONTRACT_RECURRING', contract_id,
    transaction_date: '2019-01-10', amount: 4167.03, direction: 'CREDIT', status: 'PENDING',
}) as unknown as InternalTransaction;

const pos = (numero: number, abertasAntes: number[] = []): PosicaoNaSerie => ({
    contractId: 'c1', numeroContrato: 'CTL-006-012-0001', numero, total: 30, abertasAntes,
});

const ctx = (m: Map<string, PosicaoNaSerie>) => ({ posicaoNaSerie: (t: InternalTransaction) => m.get(t.id) }) as unknown as PendingInternalRowCtx;

describe('Pendentes › coluna Sequência sugerida', () => {
    it('é coluna da tabela, ordenável, entre Data e Valor', () => {
        const keys = PENDING_INTERNAL_COLUMNS.map(c => c.key);
        expect(keys.indexOf('sequencia')).toBe(keys.indexOf('date') + 1);
        expect(PENDING_INTERNAL_COLUMN_HEADERS.sequencia).toMatchObject({ label: 'Sequência sugerida', sortField: 'sequencia' });
    });

    it('parcela de contrato: "Parcela 05 de 30" e o aviso de anterior em aberto', () => {
        render(<>{renderPendingInternalCell('sequencia', tx('t5'), ctx(new Map([['t5', pos(5, [4])]])))}</>);
        expect(screen.getByText(/Parcela 05 de 30/)).toBeTruthy();
        expect(screen.getByText('· 04 em aberto')).toBeTruthy();
        // Na Pendentes não há movimento sugerido para trocar: nunca o botão "usar a NN".
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('lançamento que não é parcela de contrato fica com "—"', () => {
        render(<>{renderPendingInternalCell('sequencia', tx('m1', null), ctx(new Map()))}</>);
        expect(screen.getByTitle('O lançamento não é parcela de contrato').textContent).toBe('—');
    });

    it('chave de ordenação agrupa por contrato, na ordem da série', () => {
        const chaves = [pos(10), pos(2), { ...pos(1), numeroContrato: 'AAA' }].map(chaveDaSequencia).sort();
        expect(chaves).toEqual(['AAA#00001', 'CTL-006-012-0001#00002', 'CTL-006-012-0001#00010']);
        expect(chaveDaSequencia(undefined)).toBe('');
    });
});
