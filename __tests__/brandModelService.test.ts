import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Supabase falso: cada `from(tabela)` devolve um construtor que registra as
 * chamadas e, ao ser aguardado, responde com o que `responder` decidir.
 */
type Chamada = { tabela: string; ops: [string, unknown[]][] };
const chamadas: Chamada[] = [];
let responder: (c: Chamada) => { data?: unknown; error?: unknown } = () => ({ data: [] });

function construtor(tabela: string) {
    const c: Chamada = { tabela, ops: [] };
    chamadas.push(c);
    const proxy: Record<string, unknown> = {};
    for (const op of ['select', 'order', 'eq', 'not', 'insert', 'update', 'delete', 'single']) {
        proxy[op] = (...args: unknown[]) => { c.ops.push([op, args]); return proxy; };
    }
    proxy.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, ...responder(c) }).then(ok, ko);
    return proxy;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => construtor(t) } }));

import { brandModelService, mensagemDeErroCatalogo } from '../services/brandModelService';

const temOp = (c: Chamada, op: string) => c.ops.some(([o]) => o === op);
const argsDe = (c: Chamada, op: string) => c.ops.filter(([o]) => o === op).map(([, a]) => a);

beforeEach(() => {
    chamadas.length = 0;
    responder = () => ({ data: [] });
});

describe('brandModelService · REGRA #5 na leitura', () => {
    it('"Todas" (null) não aplica filtro de organização — a RLS recorta', async () => {
        await brandModelService.listBrands(null);
        await brandModelService.listModels(undefined);
        expect(chamadas.every(c => !temOp(c, 'eq'))).toBe(true);
    });

    it('com org, filtra por ela', async () => {
        await brandModelService.listBrands('org-1');
        expect(argsDe(chamadas[0], 'eq')).toContainEqual(['organization_id', 'org-1']);
    });
});

describe('brandModelService · cadastro na hora', () => {
    it('findOrCreateBrand devolve a existente ignorando acento — não cria duplicata', async () => {
        responder = c => (c.tabela === 'product_brands' && temOp(c, 'order')
            ? { data: [{ id: 'b1', name: 'Mitsubishi' }] } : { data: null });
        const m = await brandModelService.findOrCreateBrand('org-1', '  mitsubíshi ');
        expect(m.id).toBe('b1');
        expect(chamadas.some(c => temOp(c, 'insert'))).toBe(false);
    });

    it('findOrCreateBrand cria com o nome normalizado, na org do registro', async () => {
        responder = c => (temOp(c, 'insert') ? { data: { id: 'novo', name: 'Makita' } } : { data: [] });
        const m = await brandModelService.findOrCreateBrand('org-9', ' Makita  ');
        expect(m.id).toBe('novo');
        const ins = chamadas.find(c => temOp(c, 'insert'))!;
        expect(argsDe(ins, 'insert')[0][0]).toEqual({ organization_id: 'org-9', name: 'Makita' });
    });

    it('corrida (23505 no INSERT): relê e devolve a que a outra aba criou', async () => {
        let leituras = 0;
        responder = c => {
            if (temOp(c, 'insert')) return { error: { code: '23505', message: 'duplicate' } };
            leituras++;
            return { data: leituras === 1 ? [] : [{ id: 'b-outra-aba', name: 'Makita' }] };
        };
        const m = await brandModelService.findOrCreateBrand('org-1', 'Makita');
        expect(m.id).toBe('b-outra-aba');
    });

    it('resolverMarcaModelo: ids já escolhidos não geram nenhuma escrita', async () => {
        const r = await brandModelService.resolverMarcaModelo('org-1',
            { brandId: 'b1', brandName: 'WEG', modelId: 'm1', modelName: 'W22' }, 'equipamento');
        expect(r).toEqual({ brand_id: 'b1', model_id: 'm1', brand: 'WEG', model: 'W22' });
        expect(chamadas).toHaveLength(0);
    });

    it('resolverMarcaModelo: texto digitado e não cadastrado vira cadastro no salvar (nunca bloqueia)', async () => {
        responder = c => {
            if (!temOp(c, 'insert')) return { data: [] };
            return c.tabela === 'product_brands'
                ? { data: { id: 'b-novo', name: 'WEG' } }
                : { data: { id: 'm-novo', name: 'W22' } };
        };
        const r = await brandModelService.resolverMarcaModelo('org-1',
            { brandId: null, brandName: 'WEG', modelId: null, modelName: 'W22' }, 'componente');
        expect(r).toEqual({ brand_id: 'b-novo', model_id: 'm-novo', brand: 'WEG', model: 'W22' });
        const insModelo = chamadas.find(c => c.tabela === 'product_models' && temOp(c, 'insert'))!;
        expect(argsDe(insModelo, 'insert')[0][0]).toMatchObject({ brand_id: 'b-novo', item_type: 'componente', organization_id: 'org-1' });
    });

    it('resolverMarcaModelo: tudo vazio = tudo null, sem ida ao banco', async () => {
        const r = await brandModelService.resolverMarcaModelo('org-1',
            { brandId: null, brandName: ' ', modelId: null, modelName: '' }, 'equipamento');
        expect(r).toEqual({ brand_id: null, model_id: null, brand: null, model: null });
        expect(chamadas).toHaveLength(0);
    });
});

describe('brandModelService · mensagens de erro', () => {
    it('23503 na marca explica que tem modelos', () => {
        expect(mensagemDeErroCatalogo({ code: '23503', message: 'fk' }, 'marca')).toMatch(/modelos cadastrados/);
    });
    it('23505 no modelo diz que a marca já tem esse modelo', () => {
        expect(mensagemDeErroCatalogo({ code: '23505', message: 'dup' }, 'modelo')).toMatch(/já tem um modelo/);
    });
    it('erro desconhecido passa a mensagem original', () => {
        expect(mensagemDeErroCatalogo({ code: 'XX', message: 'boom' }, 'marca')).toBe('boom');
    });
});

describe('brandModelService · aplicarImportacao (planilha)', () => {
    const linha = (numero: number, marca: string, modelo?: string) => ({ numero, marca, modelo, erros: [] as string[] });

    it('marca nova é criada UMA vez e reaproveitada pelas linhas seguintes', async () => {
        responder = c => {
            if (c.tabela === 'product_brands' && temOp(c, 'insert')) return { data: { id: 'b-nova', name: 'Daikin' } };
            if (c.tabela === 'product_models' && temOp(c, 'insert')) return { data: { id: 'm', name: 'x' } };
            return { data: [] };
        };
        const r = await brandModelService.aplicarImportacao('org-1', [
            { linha: linha(2, 'Daikin', 'A'), acao: 'nova-marca-e-modelo', detalhe: '' },
            { linha: linha(3, 'DAIKIN', 'B'), acao: 'novo-modelo', detalhe: '' },
        ]);
        expect(r).toEqual({ gravadas: 2, erros: [] });
        expect(chamadas.filter(c => c.tabela === 'product_brands' && temOp(c, 'insert'))).toHaveLength(1);
        const modelos = chamadas.filter(c => c.tabela === 'product_models' && temOp(c, 'insert'));
        expect(modelos.map(c => (argsDe(c, 'insert')[0][0] as { brand_id: string }).brand_id)).toEqual(['b-nova', 'b-nova']);
    });

    it('linha recusada pelo banco não derruba as outras e volta com o número dela', async () => {
        let n = 0;
        responder = c => {
            if (c.tabela === 'product_models' && temOp(c, 'insert')) {
                n++;
                return n === 1 ? { error: { code: '23514', message: 'check' } } : { data: { id: 'm2', name: 'B' } };
            }
            return { data: [] };
        };
        const r = await brandModelService.aplicarImportacao('org-1', [
            { linha: linha(2, 'WEG', 'A'), acao: 'novo-modelo', marcaId: 'b1', detalhe: '' },
            { linha: linha(3, 'WEG', 'B'), acao: 'novo-modelo', marcaId: 'b1', detalhe: '' },
        ]);
        expect(r.gravadas).toBe(1);
        expect(r.erros).toEqual([{ numero: 2, mensagem: expect.stringMatching(/Valor fora do permitido/) }]);
    });

    it('linhas "sem mudança" e "erro" não vão ao banco', async () => {
        const r = await brandModelService.aplicarImportacao('org-1', [
            { linha: linha(2, 'WEG'), acao: 'sem-mudanca', marcaId: 'b1', detalhe: '' },
            { linha: { ...linha(3, ''), erros: ['x'] }, acao: 'erro', detalhe: '' },
        ]);
        expect(r).toEqual({ gravadas: 0, erros: [] });
        expect(chamadas).toHaveLength(0);
    });
});
