/**
 * Reajuste de locação pelo aniversário (plano 2026-11-24, Fase 2) — o caso real
 * CTL-006-012-0001: vigência 23/09/2016 → 22/03/2019, IGP-M, R$ 4.556, parcelas
 * em aberto com vencimento de 2016 a 2019. Até aqui "Aplicar" comparava o índice
 * de HOJE (10 anos de IGP-M) e só mexia em parcela com vencimento a partir de
 * hoje — nenhuma das 7 em aberto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { table: string; op: string; args?: unknown; filters: unknown[][] };
const ops: Op[] = [];
const leituras: Op[] = [];
let contrato: Record<string, unknown> = {};
let parcelas: Array<{ id: string; amount: number; due_date: string }> = [];

function table(name: string) {
    const rec: Op = { table: name, op: '', filters: [] };
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { rec.filters.push(a); return b; };
    const desde = () => rec.filters.find(f => f[0] === 'due_date')?.[1] as string | undefined;
    Object.assign(b, {
        select: () => { if (!rec.op) { rec.op = 'select'; leituras.push(rec); } return b; },
        insert: (p: unknown) => { rec.op = 'insert'; rec.args = p; ops.push(rec); return b; },
        update: (p: unknown) => {
            rec.op = 'update'; rec.args = p; ops.push(rec);
            if (name === 'contracts') contrato = { ...contrato, ...(p as object) };
            return b;
        },
        eq: filt, in: filt, not: filt, gte: filt, lte: filt, order: filt, or: filt,
        single: async () => {
            if (name === 'contracts') return { data: contrato, error: null };
            if (name === 'contract_reajustes') return { data: { id: 'r1', ...(rec.args as object) }, error: null };
            if (name === 'commercial_deals') return { data: { id: 'd1', type: 'RENTAL', property_id: 'pr1' }, error: null };
            return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve(
            name === 'internal_transactions' && rec.op === 'select'
                ? { data: parcelas.filter(p => !desde() || p.due_date >= desde()!), error: null }
                : { data: rec.op === 'select' ? [] : null, error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name), rpc: vi.fn() } }));

// IGP-M fictício: 100 em 09/2016, 105 em 09/2017, 110,25 em 09/2018, 200 em 11/2026.
const IGPM: Record<string, number> = { '2016-09': 100, '2017-09': 105, '2018-09': 110.25, '2026-11': 200 };
vi.mock('../services/contractIndexService', () => ({
    normalizeIndexName: (s?: string | null) => s ?? undefined,
    contractIndexService: {
        getClosestTo: async (_i: string, data: string) => {
            const mes = data.slice(0, 7);
            const v = IGPM[mes];
            return v ? { reference_month: `${mes}-01`, value: v } : null;
        },
    },
}));

const gerarTributos = vi.fn(async () => {});
vi.mock('../services/taxPayableService', () => ({ taxPayableService: { generateForDeal: (...a: unknown[]) => gerarTributos(...(a as [])) } }));

import { reajusteLocacaoService } from '../services/reajusteLocacaoService';

const CTL = {
    id: 'c1', organization_id: 'org1', number: 'CTL-006-012-0001', title: 'Salão', client_id: 'cl1', deal_id: 'd1',
    domain: 'LOCACAO', status: 'Ativo', is_recurring: true, start_date: '2016-09-23', end_date: '2019-03-22',
    current_value: 4556, original_value: 4556, reajuste_index: 'IGP-M',
    reajuste_data_base: '2016-09-23', reajuste_proximo: '2017-09-23',
    reajuste_periodicidade_meses: null, reajuste_aviso_dias: null,
};

beforeEach(() => {
    ops.length = 0;
    gerarTributos.mockClear();
    leituras.length = 0;
    contrato = structuredClone(CTL);
    parcelas = [
        { id: 'p-2016-11', amount: 4556, due_date: '2016-11-10' },
        { id: 'p-2017-10', amount: 4556, due_date: '2017-10-10' },
        { id: 'p-2018-10', amount: 4556, due_date: '2018-10-10' },
        { id: 'p-2019-04', amount: 4556, due_date: '2019-04-10' },
    ];
});

const atualizacoesDeParcela = () => ops.filter(o => o.table === 'internal_transactions' && o.op === 'update');

describe('reajusteLocacaoService — caso CTL-006-012-0001', () => {
    it('prévia usa o índice do ANIVERSÁRIO (09/2017), não o de hoje', async () => {
        const p = await reajusteLocacaoService.previa('c1');
        expect(p.aniversario.aniversario).toBe('2017-09-23');
        expect(p.fatorIndice).toBeCloseTo(1.05, 10);
        expect(p.parcelasEmAberto).toBe(3); // 2016-11 fica de fora: antes do aniversário
    });

    it('100% do índice: aluguel 4.556 → 4.783,80, só parcelas em aberto a partir do aniversário', async () => {
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        expect(registro.valor_novo).toBe(4783.8);
        expect(registro.parcelas_atualizadas).toBe(3);
        expect(atualizacoesDeParcela().map(o => (o.args as { amount: number }).amount)).toEqual([4783.8, 4783.8, 4783.8]);
        expect(contrato.current_value).toBe(4783.8);
        expect(contrato.reajuste_data_base).toBe('2017-09-23');
        expect(contrato.reajuste_proximo).toBe('2018-09-23');
    });

    it('dois aniversários em sequência; o terceiro já é depois do fim da vigência', async () => {
        await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        expect(registro.aniversario).toBe('2018-09-23');
        expect(registro.valor_novo).toBe(5022.99); // 4783,80 × 1,05
        expect(contrato.reajuste_proximo).toBe('2019-09-23');
        await expect(reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' })).rejects.toThrow(/renovação/);
    });

    it('não aplicar: valor e parcelas ficam, o aniversário avança e fica no histórico', async () => {
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'NAO_APLICADO' }, 'acordo com o inquilino');
        expect(atualizacoesDeParcela()).toHaveLength(0);
        expect(contrato.current_value).toBe(4556);
        expect(contrato.reajuste_proximo).toBe('2018-09-23');
        expect(registro).toMatchObject({ decisao: 'NAO_APLICADO', valor_novo: 4556, observacao: 'acordo com o inquilino' });
    });

    it('outro percentual', async () => {
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'PERCENTUAL', percentual: 3 });
        expect(registro.valor_novo).toBe(4692.68);
        expect(registro.percentual_aplicado).toBe(3);
    });

    it('data de reajuste escolhida: parcelas, data-base e próximo seguem a data, não a calculada', async () => {
        const p = await reajusteLocacaoService.previa('c1', '2017-10-15');
        expect(p.aniversario).toMatchObject({ aniversario: '2017-10-15', proximo: '2018-10-15' });
        expect(p.parcelasEmAberto).toBe(2); // a de 10/10/2017 vence antes da data escolhida
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'PERCENTUAL', percentual: 3 }, undefined, '2017-10-15');
        expect(registro.aniversario).toBe('2017-10-15');
        expect(registro.parcelas_atualizadas).toBe(2);
        expect(contrato.reajuste_data_base).toBe('2017-10-15');
        expect(contrato.reajuste_proximo).toBe('2018-10-15');
    });

    it('data de reajuste na data-base ou antes é recusada sem gravar nada', async () => {
        await expect(reajusteLocacaoService.decidir('c1', { tipo: 'PERCENTUAL', percentual: 3 }, undefined, '2016-09-01'))
            .rejects.toThrow(/depois da data-base/);
        expect(ops).toHaveLength(0);
    });

    it('reajuste que muda parcelas regera os tributos do negócio (Tributos a Pagar e coluna Tributos)', async () => {
        const r = await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        expect(gerarTributos).toHaveBeenCalledTimes(1);
        expect(gerarTributos).toHaveBeenCalledWith({ id: 'd1', type: 'RENTAL', property_id: 'pr1' }, 'org1');
        expect(r.tributosRecalculados).toBe(true);
    });

    it('não reajustar não mexe em parcela nem em tributo', async () => {
        const r = await reajusteLocacaoService.decidir('c1', { tipo: 'NAO_APLICADO' });
        expect(gerarTributos).not.toHaveBeenCalled();
        expect(r.tributosRecalculados).toBe(true);
    });

    it('falha ao regerar tributos não desfaz o reajuste, mas avisa', async () => {
        gerarTributos.mockRejectedValueOnce(new Error('rede'));
        const r = await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        expect(r.registro.parcelas_atualizadas).toBe(3);
        expect(r.tributosRecalculados).toBe(false);
    });

    it('a consulta das parcelas: em aberto, sem valor manual, desde o aniversário, do contrato E da negociação', async () => {
        await reajusteLocacaoService.previa('c1');
        const q = leituras.find(l => l.table === 'internal_transactions')!;
        expect(q.filters).toContainEqual(['status', 'PENDING']);
        expect(q.filters).toContainEqual(['valor_manual', false]);
        expect(q.filters).toContainEqual(['due_date', '2017-09-23']);
        expect(q.filters).toContainEqual(['reference_id.like.c1%,reference_id.like.tx-d1-%']);
    });
});

describe('Histórico › Editar e Excluir (pedido de 25/11/2026: "faltou CRUD")', () => {
    it('a decisão guarda o próximo de antes e o valor de antes de cada parcela — o desfazer devolve exato', async () => {
        await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' });
        const ins = ops.find(o => o.table === 'contract_reajustes' && o.op === 'insert')!.args as Record<string, unknown>;
        expect(ins.proximo_anterior).toBe('2017-09-23');
        expect(ins.parcelas_alteradas).toEqual([
            { id: 'p-2017-10', antes: 4556 }, { id: 'p-2018-10', antes: 4556 }, { id: 'p-2019-04', antes: 4556 },
        ]);
    });

    it('Excluir chama desfazer_reajuste e regera os tributos quando parcelas voltaram', async () => {
        const { supabase } = await import('../lib/supabase');
        const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
        rpc.mockReset();
        rpc.mockResolvedValue({ data: { parcelas_revertidas: 3 }, error: null });
        const r = await reajusteLocacaoService.desfazer({ id: 'r9', contract_id: 'c1' } as never);
        expect(rpc).toHaveBeenCalledWith('desfazer_reajuste', { p_registro: 'r9' });
        expect(r).toEqual({ parcelasRevertidas: 3, tributosRecalculados: true });
        expect(gerarTributos).toHaveBeenCalledTimes(1);
    });

    it('Excluir recusado pelo banco: a mensagem chega e nada é regerado', async () => {
        const { supabase } = await import('../lib/supabase');
        const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
        rpc.mockReset();
        rpc.mockResolvedValue({ data: null, error: { message: 'Só a última decisão de reajuste do contrato pode ser desfeita.' } });
        await expect(reajusteLocacaoService.desfazer({ id: 'r9', contract_id: 'c1' } as never)).rejects.toThrow(/última decisão/);
        expect(gerarTributos).not.toHaveBeenCalled();
    });

    // Contrato DEPOIS da decisão de 05/11/2018 (R$ 4.556 → 5.000), como está no banco.
    const DECISAO_0511 = {
        id: 'r1', aniversario: '2018-11-05', data_base: '2016-09-23', decisao: 'VALOR', valor_anterior: 4556, valor_novo: 5000,
        percentual_aplicado: 9.75, proximo_anterior: null, observacao: null,
    } as never;

    it('Editar: a prévia parte do contrato de ANTES da decisão (aluguel 4.556, aniversário calculado 23/09/2017)', async () => {
        contrato = { ...contrato, current_value: 5000, reajuste_data_base: '2018-11-05', reajuste_proximo: '2019-11-05' };
        const p = await reajusteLocacaoService.previa('c1', null, DECISAO_0511);
        expect(p.valorAtual).toBe(4556);
        expect(p.aniversario).toMatchObject({ dataBase: '2016-09-23', aniversario: '2017-09-23', dentroDaVigencia: true });
    });

    it('Editar com data inválida é recusado ANTES de desfazer — nada muda no banco', async () => {
        const { supabase } = await import('../lib/supabase');
        const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
        rpc.mockReset();
        contrato = { ...contrato, current_value: 5000, reajuste_data_base: '2018-11-05', reajuste_proximo: '2019-11-05' };
        await expect(reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' }, undefined, '2019-06-01', DECISAO_0511))
            .rejects.toThrow(/depois do fim da vigência/);
        expect(rpc).not.toHaveBeenCalled();
        expect(ops).toHaveLength(0);
    });

    it('Editar válido: desfaz no banco e grava a nova decisão no lugar', async () => {
        const { supabase } = await import('../lib/supabase');
        const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
        rpc.mockReset();
        // O banco devolve o contrato ao estado de antes (o mock faz o papel do desfazer).
        rpc.mockImplementation(async () => {
            contrato = { ...contrato, current_value: 4556, reajuste_data_base: '2016-09-23', reajuste_proximo: '2017-09-23' };
            return { data: { parcelas_revertidas: 0 }, error: null };
        });
        contrato = { ...contrato, current_value: 5000, reajuste_data_base: '2018-11-05', reajuste_proximo: '2019-11-05' };
        const { registro } = await reajusteLocacaoService.decidir('c1', { tipo: 'INDICE' }, undefined, '2017-09-23', DECISAO_0511);
        expect(rpc).toHaveBeenCalledWith('desfazer_reajuste', { p_registro: 'r1' });
        expect(registro).toMatchObject({ aniversario: '2017-09-23', valor_novo: 4783.8 });
        expect(contrato.reajuste_proximo).toBe('2018-09-23');
    });
});
