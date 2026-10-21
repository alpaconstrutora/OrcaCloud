/**
 * Tributo agrupado em DARF não é apagado nem regravado quando a negociação é
 * salva de novo (21/10/2026). Plano: docs/planos/2026-10-21-agrupar-tributos-em-darf.md
 *
 * `generateForDeal` apaga os automáticos pendentes (`removeForDeal`) e regera
 * com UPSERT pelo reference_id. Um tributo pendente que está num DARF voltaria
 * com outro id, fora da guia — e o banco recusa o delete do membro. A regeração
 * trata o agrupado como o pago: fora do delete e fora do upsert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: unknown };
const upserts: Record<string, unknown>[][] = [];
const deletados: string[][] = [];
let falharLeituraDosPagos = false;

const PAGO = { id: 't-darf', reference_id: 'tax-DEAL-p1-iss', status: 'PENDING', business_status: 'PREVISTO', darf_id: 'darf-1' };
const PENDENTE = { id: 't-pend', reference_id: 'tax-DEAL-p2-iss', status: 'PENDING', business_status: 'PREVISTO', darf_id: null };
const PARCELAS = [
    { id: 'p1', reference_id: 'tx-DEAL-p1', amount: 1000, due_date: '2026-02-10', status: 'CONCILIATED', business_status: 'RECEBIDO' },
    { id: 'p2', reference_id: 'tx-DEAL-p2', amount: 1000, due_date: '2026-03-10', status: 'PENDING', business_status: 'PREVISTO' },
];

/** Query builder falso: grava os filtros e responde no `await`. */
function consulta(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let op: 'select' | 'delete' | 'upsert' = 'select';
    const q: Record<string, unknown> = {};
    const encadear = (nome: string) => (...args: unknown[]) => { filtros[nome] = args; return q; };
    for (const m of ['select', 'eq', 'like', 'or', 'in', 'order', 'limit']) q[m] = encadear(m);
    q.delete = () => { op = 'delete'; return q; };
    q.upsert = (rows: Record<string, unknown>[]) => { op = 'upsert'; upserts.push(rows); return q; };
    const responder = (): Resposta => {
        if (op === 'delete') { deletados.push(((filtros.in as unknown[] | undefined)?.[1] as string[]) ?? []); return { data: null, error: null }; }
        if (op !== 'select') return { data: null, error: null };
        if (tabela === 'commercial_deals') return { data: { contract_number: 'CTV-1', code: null, tributos_retidos: [], locador_client_id: null, date: '2026-01-01' }, error: null };
        if (tabela === 'contracts') return { data: [], error: null };
        if (tabela === 'internal_transactions') {
            const eqs = JSON.stringify(filtros);
            if (eqs.includes('"direction","CREDIT"')) return { data: PARCELAS, error: null };
            if (falharLeituraDosPagos) return { data: null, error: { message: 'timeout' } };
            return { data: [PAGO, PENDENTE], error: null };
        }
        return { data: null, error: null };
    };
    q.maybeSingle = () => Promise.resolve(responder());
    q.then = (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro);
    return q;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t), rpc: vi.fn() } }));
vi.mock('../services/taxSettingsService', () => ({
    taxSettingsService: { list: vi.fn(async () => [{ id: 'iss', nome: 'ISS', aliquota: 5, ativo: true, aplica_venda_ativo: true }]) },
}));
vi.mock('../services/financialCategoryResolver', async (orig) => ({
    ...(await orig<typeof import('../services/financialCategoryResolver')>()),
    resolverCategoriaPorNomes: vi.fn(async (_org: string, nomes: string[]) => ({ category_id: null, category: nomes[0] })),
}));

import { taxPayableService } from '../services/taxPayableService';

describe('generateForDeal — tributo agrupado em DARF', () => {
    beforeEach(() => { upserts.length = 0; deletados.length = 0; falharLeituraDosPagos = false; });

    it('não apaga nem regrava o tributo do DARF; regera só os pendentes soltos', async () => {
        await taxPayableService.generateForDeal({ id: 'DEAL', type: 'SALE', property_id: 'prop' } as never, 'org-1', 'CAIXA');
        expect(deletados.flat()).toContain('t-pend');
        expect(deletados.flat()).not.toContain('t-darf');
        const gravadas = upserts.flat().map(r => r.reference_id);
        expect(gravadas).toContain('tax-DEAL-p2-iss');
        expect(gravadas).not.toContain('tax-DEAL-p1-iss');
    });
});

describe('removeForDeal — distrato com tributo em DARF', () => {
    beforeEach(() => { deletados.length = 0; });

    it('apaga só os pendentes soltos e diz quantos ficaram no DARF', async () => {
        const r = await taxPayableService.removeForDeal('DEAL', 'org-1');
        expect(deletados.flat()).toEqual(['t-pend']);
        expect(r.preservadosEmDarf).toBe(1);
    });
});
