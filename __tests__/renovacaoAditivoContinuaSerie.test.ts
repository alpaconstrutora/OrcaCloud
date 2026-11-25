/**
 * Renovação por aditivo (pedido de 25/11/2026, CTL-006-012-0001): continua a série
 * existente, marca as parcelas com o aditivo e gera os tributos. Antes: série no
 * dia 23 começando em 23/03/2019 (março e abril em dobro) e nenhum IRRF.
 * Regra pura: __tests__/continuacaoDaSerie.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][] };
const ops: Op[] = [];
let contrato: Record<string, unknown> = {};
let aditivo: Record<string, unknown> = {};
let ultimaParcela: string | null = '2019-04-10';
const filtrosOr: string[] = [];

function table(name: string) {
    const rec: Op = { table: name, op: '', filters: [] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    const linha = () => {
        if (name === 'contracts') return { data: rec.op === 'update' ? { ...contrato, ...(rec.args as object) } : contrato, error: null };
        if (name === 'contract_addendums') return { data: aditivo, error: null };
        if (name === 'commercial_deals') return { data: { id: 'd1', type: 'RENTAL', property_id: 'pr1' }, error: null };
        return { data: null, error: null };
    };
    Object.assign(b, {
        select: () => { if (!rec.op) rec.op = 'select'; return b; },
        insert: (p: unknown) => { rec.op = 'insert'; rec.args = p; ops.push(rec); return b; },
        upsert: (p: unknown) => { rec.op = 'upsert'; rec.args = p; ops.push(rec); return b; },
        update: (p: unknown) => {
            rec.op = 'update'; rec.args = p; ops.push(rec);
            if (name === 'contracts') contrato = { ...contrato, ...(p as object) };
            return b;
        },
        delete: () => { rec.op = 'delete'; ops.push(rec); return b; },
        eq: filt, in: filt, like: filt, filter: filt, gte: filt, lte: filt, order: filt, limit: filt, not: filt, neq: filt,
        or: (f: string) => { filtrosOr.push(f); return filt('or', f); },
        maybeSingle: async () => linha(),
        single: async () => linha(),
        then: (resolve: (v: unknown) => void) => resolve(
            rec.op === 'select' && name === 'internal_transactions' && rec.filters.some(f => f[0] === 'due_date' && f[1] === 'is')
                ? { data: ultimaParcela ? [{ due_date: ultimaParcela }] : [], error: null }
                : { data: rec.op === 'select' ? [] : null, error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name), rpc: vi.fn() } }));
vi.mock('../services/financialCategoryResolver', () => ({
    resolverCategoriaDoContrato: async () => ({ category: 'Aluguel', category_id: null }),
    resolverCategoriaReceitaFinanceira: async () => ({ category: 'Juros', category_id: null }),
}));
const cortarNegociacao = vi.fn(async () => 0);
vi.mock('../services/commercialFinanceService', () => ({ commercialFinanceService: { deleteDealInstallmentsFrom: (...a: unknown[]) => cortarNegociacao(...(a as [])) } }));
const gerarTributos = vi.fn(async () => {});
vi.mock('../services/taxPayableService', () => ({ taxPayableService: { generateForDeal: (...a: unknown[]) => gerarTributos(...(a as [])) } }));

import { contractService, ultimoVencimentoDaSerie } from '../services/contractService';

const CTL = {
    id: 'c1', organization_id: 'org1', project_id: null, deal_id: 'd1', number: 'CTL-006-012-0001', title: 'Salão',
    domain: 'LOCACAO', is_recurring: true, start_date: '2016-09-23', end_date: '2019-03-22', billing_cycle: 'Mensal',
    due_day: 10, payment_days: null, original_value: 4556, current_value: 4784.92, reajuste_data_base: '2018-11-05',
    reajuste_proximo: '2019-11-05', supplier_id: null, client_id: 'cl1', direction: 'INCOMING', status: 'Ativo',
};
const AD = {
    id: 'ad1', contract_id: 'c1', number: 'AD-001', status: 'Pendente', value_impact: 0,
    new_start_date: '2019-03-23', new_end_date: '2021-09-22', previous_end_date: '2019-03-22',
    new_value: 4784.92, previous_value: 4784.92,
};

beforeEach(() => {
    ops.length = 0;
    contrato = structuredClone(CTL);
    aditivo = structuredClone(AD);
    ultimaParcela = '2019-04-10';
    cortarNegociacao.mockClear();
    gerarTributos.mockClear();
});

const parcelasGeradas = () => (ops.find(o => o.table === 'internal_transactions' && o.op === 'upsert')?.args ?? []) as Array<Record<string, unknown>>;

describe('aprovar aditivo de prorrogação — CTL-006-012-0001', () => {
    it('continua a série: 30 parcelas de 10/05/2019 a 10/10/2021, no dia 10', async () => {
        await contractService.approveAddendum('ad1', 'Renovação');
        const p = parcelasGeradas();
        expect(p).toHaveLength(30);
        expect(p[0].due_date).toBe('2019-05-10');
        expect(p[29].due_date).toBe('2021-10-10');
        expect(p.every(x => String(x.due_date).endsWith('-10'))).toBe(true);
        expect(p.every(x => x.amount === 4784.92)).toBe(true);
    });

    it('cada parcela leva a marca do aditivo', async () => {
        await contractService.approveAddendum('ad1', 'Renovação');
        expect(parcelasGeradas().every(x => x.contract_addendum_id === 'ad1')).toBe(true);
    });

    it('o corte da negociação começa na 1ª parcela nova, não no início do período', async () => {
        await contractService.approveAddendum('ad1', 'Renovação');
        expect(cortarNegociacao).toHaveBeenCalledWith('d1', 'org1', '2019-05-10');
    });

    it('gera os tributos da negociação depois das parcelas', async () => {
        await contractService.approveAddendum('ad1', 'Renovação');
        expect(gerarTributos).toHaveBeenCalledTimes(1);
        expect(gerarTributos).toHaveBeenCalledWith({ id: 'd1', type: 'RENTAL', property_id: 'pr1' }, 'org1');
    });

    it('sem parcela anterior: gera do início do período, como antes', async () => {
        ultimaParcela = null;
        contrato = { ...contrato, due_day: 23 };
        await contractService.approveAddendum('ad1', 'Renovação');
        const p = parcelasGeradas();
        expect(p[0].due_date).toBe('2019-03-23');
        expect(cortarNegociacao).toHaveBeenCalledWith('d1', 'org1', '2019-03-23');
    });
});

describe('série sem o aditivo que está sendo substituído (Editar a renovação)', () => {
    it('sem aditivo a excluir: o filtro de sempre', async () => {
        filtrosOr.length = 0;
        await ultimoVencimentoDaSerie({ id: 'c1', organization_id: 'org1', deal_id: 'd1' });
        expect(filtrosOr).toEqual(['reference_id.like.c1-p%,reference_id.like.tx-d1-%']);
    });

    it('excluindo o AD-002: cada padrão só com parcela sem marca (NULL) ou de outro aditivo', async () => {
        filtrosOr.length = 0;
        await ultimoVencimentoDaSerie({ id: 'c1', organization_id: 'org1', deal_id: 'd1' }, 'ad2');
        expect(filtrosOr).toEqual([
            'and(reference_id.like.c1-p%,or(contract_addendum_id.is.null,contract_addendum_id.neq.ad2)),'
            + 'and(reference_id.like.tx-d1-%,or(contract_addendum_id.is.null,contract_addendum_id.neq.ad2))',
        ]);
    });
});
