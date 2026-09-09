/**
 * Gerar cronograma tem de carimbar `final_due_date` no contrato.
 *
 * ─── A DÍVIDA QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Até 09/09/2026 nenhuma das duas rotas que geram cronograma
 * (`generateSchedule` e `rebuildScheduleFrom`) tocava no contrato — as duas
 * terminam em `persistSchedule`, que gravava schedule + parcelas e parava aí.
 * Resultado no contrato 5772: aba Visão geral mostrando "Vencimento final —"
 * com 44 parcelas na tabela ao lado, de 2021-07-26 a 2025-02-26.
 *
 * ─── O CASO QUE FAZ O TESTE VALER ───────────────────────────────────────────
 *
 * O carimbo é SÓ do cronograma VIGENTE. O CONTRATUAL é imutável e histórico:
 * se ele também gravasse, uma renegociação que estica o prazo seria desfeita
 * pelo cronograma original na gravação seguinte, e o contrato voltaria a dizer
 * que a dívida acaba antes do que acaba.
 *
 * Plano: docs/planos/2026-09-09-divida-integridade-do-contrato.md
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const capturado: { updates: Record<string, unknown>[]; tabelas: string[] } = { updates: [], tabelas: [] };

vi.mock('../lib/supabase', () => {
    const construtor = (tabela: string) => {
        const b: Record<string, unknown> = {};
        Object.assign(b, {
            insert: () => b,
            update: (valores: Record<string, unknown>) => {
                if (tabela === 'debt_contracts') capturado.updates.push(valores);
                return b;
            },
            select: () => b,
            eq: () => Promise.resolve({ data: [{ id: 'x' }], error: null }),
            single: () => Promise.resolve({
                data: {
                    id: 'sch-1', organization_id: 'org-1', debt_contract_id: 'ct-1',
                    kind: 'VIGENTE', version: 1, is_active: true,
                },
                error: null,
            }),
            then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
        });
        return b;
    };
    return {
        supabase: {
            from: (t: string) => { capturado.tabelas.push(t); return construtor(t); },
        },
    };
});

const { debtService } = await import('../services/debtService');
const { buildSchedule } = await import('../utils/debtAmortization');

const PARAMS = {
    principal: 57000, firstDueDate: '2021-07-26', installmentCount: 44,
    installmentPeriod: 'MENSAL' as const, system: 'SAC' as const,
    nominalRate: 0.41, ratePeriod: 'MENSAL' as const,
};
const CONTRATO = { id: 'ct-1', organizationId: 'org-1' } as never;

describe('persistSchedule carimba final_due_date', () => {
    beforeEach(() => { capturado.updates = []; capturado.tabelas = []; });

    it('grava o ÚLTIMO vencimento no contrato quando o cronograma é VIGENTE', async () => {
        const rows = buildSchedule(PARAMS as never);
        await debtService.persistSchedule(CONTRATO, rows, PARAMS as never, { kind: 'VIGENTE', version: 1 });

        expect(capturado.tabelas).toContain('debt_contracts');
        expect(capturado.updates).toEqual([{ final_due_date: '2025-02-26' }]);
    });

    it('NÃO toca no contrato quando o cronograma é o CONTRATUAL', async () => {
        const rows = buildSchedule(PARAMS as never);
        await debtService.persistSchedule(CONTRATO, rows, PARAMS as never, { kind: 'CONTRATUAL', version: 1 });

        expect(capturado.tabelas).not.toContain('debt_contracts');
        expect(capturado.updates).toHaveLength(0);
    });

    it('usa o MAIOR vencimento, não a última linha do array', async () => {
        const rows = buildSchedule(PARAMS as never);
        // Fora de ordem de propósito: o array não garante ordenação por data
        // (a renegociação concatena preservadas + continuação).
        const desordenado = [rows[rows.length - 1], ...rows.slice(0, -1)];
        await debtService.persistSchedule(CONTRATO, desordenado, PARAMS as never, { kind: 'VIGENTE', version: 2 });

        expect(capturado.updates).toEqual([{ final_due_date: '2025-02-26' }]);
    });
});
