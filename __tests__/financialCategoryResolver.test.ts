/**
 * Controladoria › Conta Financeira dos produtores do razão (2026-09-20).
 *
 * A DRE lê `internal_transactions.category_id`. Contratos gravavam
 * 'Mão de Obra / Serviço' fixo em toda parcela (receita virava custo), boletos
 * não gravavam nada e os tributos automáticos gravavam 'Locação'. O resolvedor
 * é a peça única que decide id + nome; aqui se prova a regra de preferência
 * (escolhida > padrão da org > padrão global) e a classificação dos tributos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Cat = { id: string; name: string; organization_id: string | null };
let catalogo: Cat[] = [];
const filtros: unknown[][] = [];

function table(name: string) {
    expect(name).toBe('financial_categories');
    let porId: string | null = null;
    let nomes: string[] = [];
    let orgFiltro: string | null = null;   // 'org1' → org1 ou global; null → só global
    const b: Record<string, unknown> = {};
    Object.assign(b, {
        select: () => b,
        eq: (col: string, v: string) => { filtros.push([col, v]); if (col === 'id') porId = v; return b; },
        in: (col: string, v: string[]) => { filtros.push([col, v]); nomes = v; return b; },
        or: (expr: string) => { filtros.push(['or', expr]); orgFiltro = expr.match(/organization_id\.eq\.([^,]+)/)?.[1] ?? null; return b; },
        is: (col: string, v: null) => { filtros.push([col, v]); orgFiltro = null; return b; },
        maybeSingle: async () => ({ data: catalogo.find(c => c.id === porId) ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({
            data: catalogo.filter(c => nomes.includes(c.name) && (c.organization_id === null || c.organization_id === orgFiltro)),
            error: null,
        }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (name: string) => table(name) } }));

import {
    categoriaDoTributo, resolverCategoriaPorNomes, resolverCategoriaDoContrato,
    CATEGORIA_IMPOSTO_SOBRE_RECEITA, CATEGORIA_IMPOSTO_SOBRE_RESULTADO,
} from '../services/financialCategoryResolver';

describe('categoriaDoTributo — dedução da receita × imposto sobre o resultado', () => {
    it.each(['PIS', 'COFINS', 'INSS', 'ISS', 'ISSQN 5%'])('%s deduz a receita bruta', n => {
        expect(categoriaDoTributo(n)).toBe(CATEGORIA_IMPOSTO_SOBRE_RECEITA);
    });
    it.each(['IRPJ', 'CSLL', 'IR', 'Imposto de Renda'])('%s é imposto sobre o resultado', n => {
        expect(categoriaDoTributo(n)).toBe(CATEGORIA_IMPOSTO_SOBRE_RESULTADO);
    });
    it('"IRRF" não é IR sobre o resultado (retenção na fonte deduz a receita)', () => {
        // \bIR\b não casa dentro de IRRF; só a palavra isolada.
        expect(categoriaDoTributo('IRRF')).toBe(CATEGORIA_IMPOSTO_SOBRE_RECEITA);
    });
});

describe('resolverCategoriaPorNomes — preferência org > global, na ordem dos nomes', () => {
    beforeEach(() => { filtros.length = 0; });

    it('categoria da própria organização vence a global de mesmo nome na lista', async () => {
        catalogo = [
            { id: 'g-serv', name: 'Receita de Serviços', organization_id: null },
            { id: 'o-obra', name: 'Receita de Obra',     organization_id: 'org1' },
        ];
        const r = await resolverCategoriaPorNomes('org1', ['Receita de Obra', 'Receita de Serviços']);
        expect(r).toEqual({ category_id: 'o-obra', category: 'Receita de Obra' });
    });

    it('sem a primeira opção na org, cai na global seguinte', async () => {
        catalogo = [{ id: 'g-serv', name: 'Receita de Serviços', organization_id: null }];
        const r = await resolverCategoriaPorNomes('org2', ['Receita de Obra', 'Receita de Serviços']);
        expect(r).toEqual({ category_id: 'g-serv', category: 'Receita de Serviços' });
    });

    it('categoria de OUTRA organização não é usada', async () => {
        catalogo = [{ id: 'o-obra', name: 'Receita de Obra', organization_id: 'org1' }];
        const r = await resolverCategoriaPorNomes('org2', ['Receita de Obra']);
        expect(r).toEqual({ category_id: null, category: 'Receita de Obra' });
    });

    it('nenhum nome no catálogo → id nulo e o primeiro nome como texto (fallback da DRE)', async () => {
        catalogo = [];
        const r = await resolverCategoriaPorNomes('org1', ['Mão de Obra / Serviço', 'Empreiteiros']);
        expect(r).toEqual({ category_id: null, category: 'Mão de Obra / Serviço' });
    });
});

describe('resolverCategoriaDoContrato — escolhida no contrato > padrão pela direção', () => {
    it('contrato com Conta Financeira escolhida usa ela, qualquer que seja a direção', async () => {
        catalogo = [
            { id: 'c-esc', name: 'Projetos e Consultoria Técnica', organization_id: null },
            { id: 'o-obra', name: 'Receita de Obra', organization_id: 'org1' },
        ];
        const r = await resolverCategoriaDoContrato({ organization_id: 'org1', category_id: 'c-esc' }, true);
        expect(r).toEqual({ category_id: 'c-esc', category: 'Projetos e Consultoria Técnica' });
    });

    it('recebível sem escolha → receita; pagável sem escolha → custo', async () => {
        catalogo = [
            { id: 'o-obra', name: 'Receita de Obra',       organization_id: 'org1' },
            { id: 'o-mo',   name: 'Mão de Obra / Serviço', organization_id: 'org1' },
        ];
        const rec = await resolverCategoriaDoContrato({ organization_id: 'org1', category_id: null }, true);
        const pag = await resolverCategoriaDoContrato({ organization_id: 'org1', category_id: null }, false);
        expect(rec.category).toBe('Receita de Obra');
        expect(pag.category).toBe('Mão de Obra / Serviço');
    });

    it('id escolhido que já não existe (categoria apagada) → padrão pela direção', async () => {
        catalogo = [{ id: 'g-serv', name: 'Receita de Serviços', organization_id: null }];
        const r = await resolverCategoriaDoContrato({ organization_id: 'org1', category_id: 'sumiu' }, true);
        expect(r).toEqual({ category_id: 'g-serv', category: 'Receita de Serviços' });
    });
});
