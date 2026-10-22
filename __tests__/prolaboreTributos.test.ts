/**
 * Tributos do pró-labore em Tributos a Pagar (22/10/2026).
 * Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md (complemento: pró-labore)
 *
 * Antes, o envio ao financeiro gravava só o líquido do sócio: o INSS descontado
 * dele nunca virava título, e a cota patronal entrava sem party_type (fora de
 * Tributos) e sem vencimento. Terceiros eram calculados sobre pró-labore (não incidem).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: unknown };
const ops: { op: string; tabela: string; rows?: Record<string, unknown>[]; ids?: string[] }[] = [];
let existentes: Record<string, unknown>[] = [];
let conciliados: string[] = [];

function consulta(tabela: string) {
    const filtros: Record<string, unknown[]> = {};
    let op: 'select' | 'delete' | 'upsert' = 'select';
    const q: Record<string, unknown> = {};
    const encadear = (nome: string) => (...args: unknown[]) => { filtros[nome] = args; return q; };
    for (const m of ['select', 'eq', 'like', 'or', 'in', 'order', 'limit', 'is']) q[m] = encadear(m);
    q.delete = () => { op = 'delete'; return q; };
    q.upsert = (rows: Record<string, unknown>[]) => { op = 'upsert'; ops.push({ op: 'upsert', tabela, rows }); return q; };
    const responder = (): Resposta => {
        if (op === 'delete') { ops.push({ op: 'delete', tabela, ids: (filtros.in?.[1] as string[]) ?? [] }); return { data: null, error: null }; }
        if (op === 'upsert') return { data: null, error: null };
        if (tabela === 'internal_transactions') return { data: existentes, error: null };
        if (tabela === 'reconciliation_matches') return { data: conciliados.map(id => ({ internal_transaction_id: id })), error: null };
        return { data: [], error: null };
    };
    q.single = () => Promise.resolve(responder());
    q.maybeSingle = () => Promise.resolve(responder());
    q.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro);
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t), rpc: vi.fn() } }));
vi.mock('../services/fiscalService', () => ({ fiscalService: { getIRRFBrackets: vi.fn(async () => []) } }));
vi.mock('../services/documentService', () => ({ documentService: {} }));
vi.mock('../services/supplierService', () => ({ supplierService: {} }));
vi.mock('../services/companyService', () => ({ companyService: {} }));

import { remuneracaoSocietariaService } from '../services/remuneracaoSocietariaService';

const FOLHA = { id: 'f1c50980', competence_month: '2026-07-01', inss_total: 550, irrf_total: 0, patronal_total: 1000 } as never;
const gravados = () => ops.filter(o => o.op === 'upsert').flatMap(o => o.rows ?? []);

describe('syncTributosDoProlabore', () => {
    beforeEach(() => { ops.length = 0; existentes = []; conciliados = []; });

    it('grava INSS do sócio e cota patronal como TAX (Tributos a Pagar), vencendo no dia 20', async () => {
        await remuneracaoSocietariaService.syncTributosDoProlabore('org', FOLHA);
        expect(gravados()).toEqual([
            expect.objectContaining({ reference_id: 'prolabore-f1c50980-inss', party_type: 'TAX', party_name: 'INSS (pró-labore)', amount: 550, due_date: '2026-08-20', business_status: 'PREVISTO', source_system: 'PROLABORE' }),
            expect.objectContaining({ reference_id: 'prolabore-f1c50980-cpp', party_type: 'TAX', amount: 1000 }),
        ]);
    });

    it('apaga a linha do formato antigo (reference_id = id da folha) em aberto', async () => {
        existentes = [{ id: 'velho', reference_id: 'f1c50980', status: 'PENDING', business_status: null, darf_id: null }];
        await remuneracaoSocietariaService.syncTributosDoProlabore('org', FOLHA);
        expect(ops.find(o => o.op === 'delete')?.ids).toEqual(['velho']);
    });

    it('não regrava nem apaga tributo pago, conciliado ou em DARF', async () => {
        existentes = [
            { id: 'pago', reference_id: 'prolabore-f1c50980-inss', status: 'PENDING', business_status: 'PAGO', darf_id: null },
            { id: 'darf', reference_id: 'prolabore-f1c50980-cpp', status: 'PENDING', business_status: 'PREVISTO', darf_id: 'd1' },
            { id: 'conc', reference_id: 'f1c50980', status: 'PENDING', business_status: null, darf_id: null },
        ];
        conciliados = ['conc'];
        await remuneracaoSocietariaService.syncTributosDoProlabore('org', FOLHA);
        expect(gravados()).toEqual([]);
        expect(ops.some(o => o.op === 'delete')).toBe(false);
    });
});

describe('calculateProlabore', () => {
    it('terceiros não incidem sobre pró-labore; CPP 20% fora do Simples', async () => {
        vi.spyOn(remuneracaoSocietariaService, 'getProlaboreInssRule').mockResolvedValue({ rate: 0.11, teto: 8157.41, patronal_rate: 0.2 });
        const r = await remuneracaoSocietariaService.calculateProlabore(5000, '2026-07-01', 'lucro_presumido', 'org', false);
        expect(r).toMatchObject({ inss_amount: 550, patronal_amount: 1000, terceiros_amount: 0 });
        const simples = await remuneracaoSocietariaService.calculateProlabore(5000, '2026-07-01', 'simples', 'org', false);
        expect(simples.patronal_amount).toBe(0);
    });
});
