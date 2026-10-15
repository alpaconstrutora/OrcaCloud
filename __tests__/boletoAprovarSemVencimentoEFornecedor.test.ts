/**
 * Duas correções do módulo de boletos que a captura por e-mail exporia
 * (15/10/2026 — docs/planos/2026-10-15-captura-boletos-por-email.md, item 1.4).
 *
 * 1. Boleto sem vencimento NÃO vira título. Até aqui o título nascia com
 *    `transaction_date = hoje` (o dia do clique) — o defeito de 24/09 voltava
 *    para os boletos sem vencimento. A recusa tem de acontecer ANTES de
 *    qualquer gravação (nota, título), e o lote tem de reportar o boleto.
 *
 * 2. Sugestão de fornecedor só DENTRO da organização do boleto, comparando só
 *    dígitos. Era `ILIKE '%dígitos%'` sem org sobre documento mascarado: não
 *    casava, ou casava fornecedor de outra organização.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Linha = Record<string, unknown>;

const db: Record<string, Linha[]> = {};
const inserts: Array<{ tabela: string; linha: unknown }> = [];
const updates: Array<{ tabela: string; patch: Linha; filtros: Array<[string, unknown]> }> = [];
const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
let respostaRpc: { data: unknown; error: unknown } = { data: [], error: null };

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
        rpc: async (nome: string, args: Record<string, unknown>) => (rpcs.push({ nome, args }), respostaRpc),
        storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
    },
}));

vi.mock('../services/boletoNomeDocumentoService', () => ({
    renomearDocumentoDoBoleto: async () => undefined,
    renomearDocumentosDosBoletos: async () => undefined,
}));

import { boletoService, MOTIVO_SEM_VENCIMENTO } from '../services/boletoService';

const ORG = 'org-1';

beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    rpcs.length = 0;
    respostaRpc = { data: [], error: null };
    db.boletos = [{
        id: 'b1', organization_id: ORG, status: 'rascunho', supplier_id: 'sup-1',
        vencimento: null, valor: 100, documento_path: 'org-1/2026/x.pdf', documento_nome: 'x.pdf',
    }];
});

describe('aprovar boleto sem vencimento', () => {
    it('recusa com a frase única e não grava nota nem título', async () => {
        await expect(boletoService.aprovarECriarInvoice('b1', ORG)).rejects.toThrow(MOTIVO_SEM_VENCIMENTO);
        expect(inserts).toHaveLength(0);
        expect(db.boletos[0].status).toBe('rascunho');
    });

    it('no lote, o boleto sem vencimento sai em `errors` com o motivo', async () => {
        const r = await boletoService.aprovarEmLote(['b1'], ORG, {});
        expect(r.ok).toEqual([]);
        expect(r.errors).toEqual([{ id: 'b1', error: MOTIVO_SEM_VENCIMENTO }]);
        expect(inserts).toHaveLength(0);
    });

    it('o fornecedor continua sendo cobrado primeiro', async () => {
        db.boletos[0].supplier_id = null;
        await expect(boletoService.aprovarECriarInvoice('b1', ORG)).rejects.toThrow(/fornecedor/i);
    });
});

describe('sugerirFornecedor — só na organização do boleto', () => {
    it('chama a RPC com a organização e só os dígitos do CNPJ', async () => {
        respostaRpc = { data: [{ id: 'sup-9', name: 'ACME', document: '11.222.333/0001-81' }], error: null };
        const id = await boletoService.sugerirFornecedor('b1', ORG, '11.222.333/0001-81');
        expect(id).toBe('sup-9');
        expect(rpcs).toEqual([{
            nome: 'find_supplier_in_org_by_document',
            args: { p_organization_id: ORG, p_document: '11222333000181' },
        }]);
        const up = updates.find(u => u.tabela === 'boletos');
        expect(up?.patch).toEqual({ sugestao_supplier_id: 'sup-9', sugestao_confianca: 95 });
        expect(up?.filtros).toContainEqual(['organization_id', ORG]);
    });

    it('CNPJ com DV errado nem consulta', async () => {
        expect(await boletoService.sugerirFornecedor('b1', ORG, '11.222.333/0001-82')).toBeNull();
        expect(rpcs).toHaveLength(0);
    });

    it('sem fornecedor na org, ou RPC com erro, devolve null sem gravar', async () => {
        expect(await boletoService.sugerirFornecedor('b1', ORG, '11222333000181')).toBeNull();
        respostaRpc = { data: null, error: { message: 'boom' } };
        expect(await boletoService.sugerirFornecedor('b1', ORG, '11222333000181')).toBeNull();
        expect(updates.filter(u => u.tabela === 'boletos')).toHaveLength(0);
    });
});
