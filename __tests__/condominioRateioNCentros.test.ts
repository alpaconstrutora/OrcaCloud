/**
 * Rateio condominial com VÁRIOS centros de custo por condomínio
 * (docs/planos/2026-09-19-centro-de-custo-n-por-empreendimento.md).
 *
 * Até 2026-09-19 o índice único `uidx_cost_center_por_empreendimento` garantia
 * um centro de custo por condomínio, e a prévia filtrava por UM `cost_center_id`.
 * Com N centros de custo, o risco é exatamente o que o comentário da migration
 * antiga temia: despesa lançada no segundo centro de custo sumindo do rateio
 * em silêncio. A regra nova é SOMAR — e é isso que estes testes travam.
 *
 * O cliente Supabase é um dublê em memória que entende só a cadeia que a
 * prévia usa (from/select/eq/in/is/gte/lt/order/then).
 */
import { describe, it, expect, vi } from 'vitest';

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {
    cost_centers_v2: [
        { id: 'cc-b', code: '012', name: 'Garden - Obra', empreendimento_id: 'emp-garden' },
        { id: 'cc-a', code: '005', name: 'Garden - Venda de Ativos', empreendimento_id: 'emp-garden' },
        { id: 'cc-x', code: '001', name: 'Outro condomínio', empreendimento_id: 'emp-outro' },
    ],
    internal_transactions: [
        { id: 't1', description: 'Água', amount: 100, transaction_date: '2026-09-05', direction: 'DEBIT', cost_center_id: 'cc-a' },
        { id: 't2', description: 'Luz', amount: 250.5, transaction_date: '2026-09-10', direction: 'DEBIT', cost_center_id: 'cc-b' },
        { id: 't3', description: 'Receita', amount: 999, transaction_date: '2026-09-10', direction: 'CREDIT', cost_center_id: 'cc-b' },
        { id: 't4', description: 'Outro mês', amount: 70, transaction_date: '2026-10-01', direction: 'DEBIT', cost_center_id: 'cc-a' },
        { id: 't5', description: 'Outro condomínio', amount: 33, transaction_date: '2026-09-12', direction: 'DEBIT', cost_center_id: 'cc-x' },
    ],
    unit_occupancies: [],
    clients: [],
};

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let ordem: { campo: string; asc: boolean } | null = null;
    const q: any = {
        select() { return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        is(k: string, v: unknown) { preds.push(r => r[k] == v); return q; },
        gte(k: string, v: string) { preds.push(r => String(r[k]) >= v); return q; },
        lt(k: string, v: string) { preds.push(r => String(r[k]) < v); return q; },
        order(campo: string, o?: { ascending?: boolean }) { ordem = { campo, asc: o?.ascending !== false }; return q; },
        then(resolve: (v: { data: Linha[]; error: null }) => unknown) {
            let rows = (tabelas[table] ?? []).filter(r => preds.every(p => p(r)));
            if (ordem) rows = [...rows].sort((a, b) => String(a[ordem!.campo]).localeCompare(String(b[ordem!.campo])) * (ordem!.asc ? 1 : -1));
            return Promise.resolve(resolve({ data: rows, error: null }));
        },
    };
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: {
        listAllUnitsForEmpreendimento: async () => [
            { id: 'u1', identifier: '101', fracao_ideal_decimal: 0.5, private_area: 80 },
            { id: 'u2', identifier: '102', fracao_ideal_decimal: 0.5, private_area: 80 },
        ],
    },
}));

import { condominioRateioService } from '../services/condominioRateioService';

describe('getCentrosDeCusto', () => {
    it('devolve TODOS os centros de custo do condomínio, por código', async () => {
        const r = await condominioRateioService.getCentrosDeCusto('emp-garden');
        expect(r.map(c => c.code)).toEqual(['005', '012']);
    });

    it('condomínio sem centro de custo → lista vazia (não null)', async () => {
        expect(await condominioRateioService.getCentrosDeCusto('emp-sem')).toEqual([]);
    });
});

describe('previa — a despesa é a SOMA dos centros de custo do condomínio', () => {
    const base = { empreendimentoId: 'emp-garden', competencia: '2026-09-01', criterio: 'IGUAL' as const };

    it('dois centros de custo: entra a despesa dos dois (só DEBIT, só a competência — o dia 1º do mês seguinte fica FORA —, só os dele)', async () => {
        const p = await condominioRateioService.previa({ ...base, costCenterIds: ['cc-a', 'cc-b'] });
        expect(p.despesas.map(d => d.transaction_id).sort()).toEqual(['t1', 't2']);
        expect(p.totalDespesas).toBeCloseTo(350.5, 2);
        // e o rateio fecha ao centavo entre as 2 unidades
        expect(p.totalRateado).toBeCloseTo(350.5, 2);
    });

    it('um centro de custo só: a despesa do outro NÃO entra (é o que o desvincular promete)', async () => {
        const p = await condominioRateioService.previa({ ...base, costCenterIds: ['cc-a'] });
        expect(p.despesas.map(d => d.transaction_id)).toEqual(['t1']);
        expect(p.totalDespesas).toBe(100);
    });

    it('títulos escolhidos (`transactionIds`) de centros de custo diferentes do mesmo condomínio entram juntos', async () => {
        const p = await condominioRateioService.previa({ ...base, costCenterIds: ['cc-a', 'cc-b'], transactionIds: ['t1', 't2', 't5'] });
        // t5 é de OUTRO condomínio — o guarda de CC continua valendo
        expect(p.despesas.map(d => d.transaction_id).sort()).toEqual(['t1', 't2']);
    });

    it('dezembro: a janela vai até 1º de janeiro do ano seguinte, sem entrar nele', async () => {
        tabelas.internal_transactions.push(
            { id: 'dz1', description: 'Dez', amount: 10, transaction_date: '2026-12-31', direction: 'DEBIT', cost_center_id: 'cc-a' },
            { id: 'dz2', description: 'Jan', amount: 20, transaction_date: '2027-01-01', direction: 'DEBIT', cost_center_id: 'cc-a' },
        );
        const p = await condominioRateioService.previa({ ...base, competencia: '2026-12-01', costCenterIds: ['cc-a'] });
        expect(p.despesas.map(d => d.transaction_id)).toEqual(['dz1']);
    });

    it('lista vazia de centros de custo → erro claro, nunca "todas as despesas"', async () => {
        await expect(condominioRateioService.previa({ ...base, costCenterIds: [] }))
            .rejects.toThrow(/não tem centro de custo/);
    });
});
