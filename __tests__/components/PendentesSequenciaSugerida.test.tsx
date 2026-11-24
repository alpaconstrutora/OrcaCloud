// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    renderPendingBankCell, PENDING_BANK_COLUMNS, PENDING_BANK_COLUMN_HEADERS, PENDING_BANK_TD_META,
    PENDING_INTERNAL_COLUMNS, type PendingBankRowCtx,
} from '../../components/reconciliation/tabelasDaConciliacao';
import { chaveDaSequencia } from '../../components/reconciliation/CelulaSequencia';
import type { BankTransaction } from '../../types';
import type { PosicaoNaSerie } from '../../utils/sequenciaParcelas';

// Pendentes › Extrato Bancário: coluna "Sequência sugerida" (pedido de 24/11/2026) — a parcela
// que o movimento provavelmente paga (a da sugestão-topo do motor), mesma célula da Central.
// Nos Lançamentos ela NÃO entra: ali o número da parcela o próprio app já gera.

const tx = (id: string) => ({
    id, bank_account_id: 'conta', transaction_date: '2019-01-07', amount: 4167.03, direction: 'CREDIT', status: 'NORMALIZED',
}) as unknown as BankTransaction;

const pos = (numero: number, abertasAntes: number[] = [], extra: Partial<PosicaoNaSerie> = {}): PosicaoNaSerie => ({
    contractId: 'c1', numeroContrato: 'CTL-006-012-0001', numero, total: 30, abertasAntes, ...extra,
});

const ctx = (m: Map<string, PosicaoNaSerie>, onUsarMaisAntiga = vi.fn()) =>
    ({ posicaoNaSerie: (t: BankTransaction) => m.get(t.id), onUsarMaisAntiga }) as unknown as PendingBankRowCtx;

describe('Pendentes › Extrato Bancário › coluna Sequência sugerida', () => {
    it('é coluna do Extrato, ordenável, entre Data e Valor — e não dos Lançamentos', () => {
        const keys = PENDING_BANK_COLUMNS.map(c => c.key);
        expect(keys.indexOf('sequencia')).toBe(keys.indexOf('date') + 1);
        expect(PENDING_BANK_COLUMN_HEADERS.sequencia).toMatchObject({ label: 'Sequência sugerida', sortField: 'sequencia' });
        // o clique no "usar a NN" não pode selecionar a linha junto
        expect(PENDING_BANK_TD_META.sequencia.stopPropagation).toBe(true);
        expect(PENDING_INTERNAL_COLUMNS.map(c => c.key)).not.toContain('sequencia');
    });

    it('movimento com sugestão de parcela: "Parcela 25 de 30" e o aviso de anterior em aberto', () => {
        render(<>{renderPendingBankCell('sequencia', tx('b1'), ctx(new Map([['b1', pos(25, [1])]])))}</>);
        expect(screen.getByText(/Parcela 25 de 30/)).toBeTruthy();
        expect(screen.getByText('· 01 em aberto')).toBeTruthy();
    });

    it('mais antiga em aberto com o MESMO valor: "usar a 01" chama a troca com ela', () => {
        const antiga = { id: 't-nov16', numero: 1, due_date: '2016-11-10', valor: 4167.03 };
        const onUsar = vi.fn();
        render(<>{renderPendingBankCell('sequencia', tx('b1'),
            ctx(new Map([['b1', pos(25, [1], { valor: 4167.03, maisAntigaAberta: antiga })]]), onUsar))}</>);
        fireEvent.click(screen.getByRole('button', { name: 'usar a 01' }));
        expect(onUsar).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), antiga);
    });

    it('movimento sem sugestão de parcela fica com "—"', () => {
        render(<>{renderPendingBankCell('sequencia', tx('b2'), ctx(new Map()))}</>);
        expect(screen.getByTitle('Sem sugestão de parcela de contrato para este movimento').textContent).toBe('—');
    });

    it('chave de ordenação agrupa por contrato, na ordem da série', () => {
        const chaves = [pos(10), pos(2), { ...pos(1), numeroContrato: 'AAA' }].map(chaveDaSequencia).sort();
        expect(chaves).toEqual(['AAA#00001', 'CTL-006-012-0001#00002', 'CTL-006-012-0001#00010']);
        expect(chaveDaSequencia(undefined)).toBe('');
    });
});
