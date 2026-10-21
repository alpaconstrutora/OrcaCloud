/**
 * `boletoService.aprovarEmLote` com a regra do lote (21/10/2026 —
 * docs/planos/2026-10-21-boleto-lote-aprovar-sem-alterar.md, item 2).
 *
 * O "Aprovar e Lançar" da Edição em Lote passou a funcionar sem alteração de
 * campo. Este teste trava o que o SERVIÇO grava: boleto fora de rascunho/
 * revisão não é tocado, e o fornecedor sugerido vira `supplier_id` (com
 * auditoria) antes da aprovação. A aprovação individual tem teste próprio
 * (`boletoAprovarSemVencimentoEFornecedor.test.ts`) — aqui ela é substituída.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Linha = Record<string, unknown>;

const db: Record<string, Linha[]> = {};
const inserts: Array<{ tabela: string; linha: unknown }> = [];
const updates: Array<{ tabela: string; patch: Linha; filtros: Array<[string, unknown]> }> = [];

function query(tabela: string, modo: 'select' | 'update', patch: Linha = {}) {
    const filtros: Array<[string, unknown]> = [];
    const executar = () => {
        const linhas = (db[tabela] ?? []).filter(l => filtros.every(([c, v]) => l[c] === v));
        if (modo === 'update') {
            updates.push({ tabela, patch, filtros: [...filtros] });
            linhas.forEach(l => Object.assign(l, patch));
        }
        return { data: linhas, error: null };
    };
    const api: any = {
        eq: (c: string, v: unknown) => (filtros.push([c, v]), api),
        in: () => api,
        select: () => api,
        single: async () => ({ data: executar().data[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: executar().data[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(executar()).then(resolve),
    };
    return api;
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: () => query(tabela, 'select'),
            update: (patch: Linha) => query(tabela, 'update', patch),
            insert: (linha: unknown) => {
                inserts.push({ tabela, linha });
                const r = { data: { id: 'novo' }, error: null };
                return { select: () => ({ single: async () => r, maybeSingle: async () => r }), then: (res: (v: unknown) => unknown) => Promise.resolve(r).then(res) };
            },
        }),
        rpc: async () => ({ data: [], error: null }),
        storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
    },
}));

vi.mock('../services/boletoNomeDocumentoService', () => ({
    renomearDocumentoDoBoleto: async () => undefined,
    renomearDocumentosDosBoletos: async () => undefined,
}));

import { boletoService } from '../services/boletoService';
import { MOTIVO_SEM_FORNECEDOR, motivoDoStatus } from '../utils/boletoAprovacaoLote';

const ORG = 'org-1';
const base = { organization_id: ORG, vencimento: '2026-06-21', valor: 107.32, sugestao_supplier_id: null };
const aprovados: string[] = [];

beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    aprovados.length = 0;
    db.boletos = [
        { id: 'pago', ...base, status: 'pago', supplier_id: 'sup-1' },
        { id: 'energisa', ...base, status: 'revisao', supplier_id: null, sugestao_supplier_id: 'sup-energisa' },
        { id: 'semfornecedor', ...base, status: 'revisao', supplier_id: null },
    ];
    vi.spyOn(boletoService, 'aprovarECriarInvoice').mockImplementation(async (id: string) => {
        aprovados.push(id);
        return { id } as never;
    });
});

describe('aprovarEmLote sem campos alterados', () => {
    it('boleto pago não é aprovado nem tocado; sai em errors com o motivo', async () => {
        const r = await boletoService.aprovarEmLote(['pago'], ORG, {});
        expect(r).toEqual({ ok: [], errors: [{ id: 'pago', error: motivoDoStatus('pago') }] });
        expect(aprovados).toEqual([]);
        expect(updates).toEqual([]);
        expect(db.boletos[0].status).toBe('pago');
    });

    it('fornecedor sugerido vira supplier_id, com auditoria, antes de aprovar', async () => {
        const r = await boletoService.aprovarEmLote(['energisa'], ORG, {});
        expect(r).toEqual({ ok: ['energisa'], errors: [] });
        expect(db.boletos[1].supplier_id).toBe('sup-energisa');
        const up = updates.find(u => u.tabela === 'boletos');
        expect(up?.patch).toEqual({ supplier_id: 'sup-energisa' });
        expect(up?.filtros).toContainEqual(['organization_id', ORG]);
        expect(inserts).toContainEqual({
            tabela: 'boletos_auditoria',
            linha: expect.objectContaining({ boleto_id: 'energisa', acao: 'associacao_lote', valor_depois: { supplier_id: 'sup-energisa', origem: 'sugestao' } }),
        });
        expect(aprovados).toEqual(['energisa']);
    });

    it('lote misto: aprova o que pode e diz o motivo do resto', async () => {
        const r = await boletoService.aprovarEmLote(['pago', 'energisa', 'semfornecedor'], ORG, {});
        expect(r.ok).toEqual(['energisa']);
        expect(r.errors).toEqual([
            { id: 'pago', error: motivoDoStatus('pago') },
            { id: 'semfornecedor', error: MOTIVO_SEM_FORNECEDOR },
        ]);
        expect(aprovados).toEqual(['energisa']);
    });

    it('boleto de outra organização não é achado nem aprovado', async () => {
        const r = await boletoService.aprovarEmLote(['energisa'], 'outra-org', {});
        expect(r.ok).toEqual([]);
        expect(r.errors[0].error).toMatch(/não encontrado/);
        expect(aprovados).toEqual([]);
    });
});
