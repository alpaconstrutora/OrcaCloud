/**
 * Coluna "Código" da aba Despesas do condomínio.
 *
 * O código é o do DOCUMENTO de origem — hoje o nº do boleto, com os mesmos 4
 * dígitos que a Conciliação Bancária imprime (`loadOriginCodes` em
 * `components/BankReconciliation.tsx`). O risco que estes testes travam é o
 * mesmo dos dois lados: o nº ser formatado diferente em cada tela, e o
 * lançamento sem código inventar um a partir do uuid.
 *
 * Dublê em memória do cliente Supabase, só com a cadeia que `listarLancamentos`
 * usa (from/select/eq/in/gte/lt/order/then).
 */
import { describe, it, expect, vi } from 'vitest';

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {
    cost_centers_v2: [
        { id: 'cc-a', code: '011', name: 'Bella Vista', empreendimento_id: 'emp-bv' },
    ],
    internal_transactions: [
        { id: 't1', description: 'Elevador', amount: 362.33, transaction_date: '2026-09-10', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-705', party_name: 'MN Conservação' },
        // numero de 1 dígito: tem de sair com 4, como na Conciliação.
        { id: 't2', description: 'Água', amount: 99.61, transaction_date: '2026-09-11', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-6', party_name: 'Copasa' },
        // origem sem código próprio → null, nunca o uuid.
        { id: 't3', description: 'Reembolso', amount: 40, transaction_date: '2026-09-12', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'MANUAL', reference_id: null, party_name: 'Síndico' },
        // BOLETO cujo registro sumiu de `boletos` (RLS ou exclusão): null, e a
        // linha continua na lista — a despesa existe mesmo sem o documento.
        { id: 't4', description: 'Luz', amount: 72.14, transaction_date: '2026-09-13', direction: 'DEBIT', cost_center_id: 'cc-a', source_system: 'BOLETO', reference_id: 'b-sumido', party_name: 'Energisa' },
    ],
    boletos: [
        { id: 'b-705', numero: 705 },
        { id: 'b-6', numero: 6 },
        { id: 'b-nulo', numero: null },
    ],
    condominio_rateio_despesas: [],
};

function builder(table: string) {
    const preds: Array<(r: Linha) => boolean> = [];
    let ordem: { campo: string; asc: boolean } | null = null;
    const q: any = {
        select() { return q; },
        eq(k: string, v: unknown) { preds.push(r => r[k] === v); return q; },
        in(k: string, vs: unknown[]) { preds.push(r => vs.includes(r[k])); return q; },
        is(k: string, v: unknown) { preds.push(r => r[k] == v); return q; },
        neq(k: string, v: unknown) {
            preds.push(r => {
                const valor = k.split('.').reduce<unknown>(
                    (acc, parte) => (acc == null ? acc : (acc as Linha)[parte]), r);
                return valor !== v;
            });
            return q;
        },
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
    empreendimentoService: { listAllUnitsForEmpreendimento: async () => [] },
}));

import { condominioRateioService } from '../services/condominioRateioService';

const carregar = () => condominioRateioService.listarLancamentos({
    costCenterIds: ['cc-a'],
    competencia: '2026-09-01',
});

describe('listarLancamentos — coluna Código', () => {
    it('boleto traz o nº com 4 dígitos, igual à Conciliação Bancária', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't1')!.codigo).toBe('0705');
    });

    it('nº de um dígito também sai com 4 — senão a mesma tela mostra "6" e "0705" lado a lado', async () => {
        const l = await carregar();
        expect(l.find(x => x.id === 't2')!.codigo).toBe('0006');
    });

    it('origem sem código próprio fica null — nunca o uuid do lançamento', async () => {
        const l = await carregar();
        const t3 = l.find(x => x.id === 't3')!;
        expect(t3.codigo).toBeNull();
        expect(t3.descricao).toContain('Reembolso');
    });

    it('boleto que não volta de `boletos` fica sem código, mas a despesa CONTINUA na lista', async () => {
        const l = await carregar();
        const t4 = l.find(x => x.id === 't4');
        expect(t4).toBeDefined();
        expect(t4!.codigo).toBeNull();
        expect(l).toHaveLength(4);
    });
});

describe('codigosDeBoleto', () => {
    it('`numero` nulo não vira a string "null"', async () => {
        const m = await condominioRateioService.codigosDeBoleto(['b-nulo']);
        expect(m.has('b-nulo')).toBe(false);
    });

    it('lista vazia não consulta nada e devolve mapa vazio', async () => {
        expect((await condominioRateioService.codigosDeBoleto([])).size).toBe(0);
    });

    it('id repetido é consultado uma vez só', async () => {
        const m = await condominioRateioService.codigosDeBoleto(['b-705', 'b-705', 'b-6']);
        expect([...m.entries()].sort()).toEqual([['b-6', '0006'], ['b-705', '0705']]);
    });
});
