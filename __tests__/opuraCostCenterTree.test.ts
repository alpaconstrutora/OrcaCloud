import { describe, it, expect } from 'vitest';
import {
    buildCostCenterTree, flattenCostCenterTree,
    SEM_CENTRO_LABEL, LANCADO_NO_GRUPO_LABEL,
} from '../utils/opuraCostCenterTree';

// Espelho reduzido do cadastro da Alpa (Organização › Centro de Custo)
const catalog = [
    { id: 'obra', parent_id: null, code: '001', name: 'Obra' },
    { id: 'adm', parent_id: null, code: '002', name: 'Administrativo' },
    { id: 'cond', parent_id: null, code: '006', name: 'Condomínios' },
    { id: 'galeria', parent_id: 'cond', code: '010', name: '010 - Galeria Altavista' },
    { id: 'bella', parent_id: 'cond', code: '011', name: '007 - Bella Vista' },
    { id: 'ativos', parent_id: null, code: '020', name: 'Ativos' },
    { id: 'manut', parent_id: 'ativos', code: '021', name: 'Manutenção' },
];

const row = (key: string | null, label: string, qtd: number, realizado = 0, previsto = 0, vencido = 0) =>
    ({ dimension_key: key, dimension_label: label, qtd, realizado, previsto, vencido });

describe('buildCostCenterTree', () => {
    it('agrupa filhos sob o grupo, soma os totais e ordena por código', () => {
        const tree = buildCostCenterTree([
            row('bella', 'Condomínios › 007 - Bella Vista', 50, -23817),
            row('galeria', 'Condomínios › 010 - Galeria Altavista', 12, 0, 500),
            row('manut', 'Ativos › Manutenção', 1, 0, -360),
        ], catalog);

        expect(tree.map(n => n.name)).toEqual(['Condomínios', 'Ativos']);
        const cond = tree[0];
        expect(cond.depth).toBe(0);
        expect(cond.totals).toEqual({ qtd: 62, realizado: -23817, previsto: 500, vencido: 0 });
        expect(cond.own).toBeNull();
        expect(cond.children.map(c => [c.name, c.depth])).toEqual([
            ['010 - Galeria Altavista', 1],
            ['007 - Bella Vista', 1],
        ]);
        expect(tree[1].children[0].name).toBe('Manutenção');
    });

    it('grupo com lançamentos diretos E filhos ganha o filho sintético "(lançado no grupo)"', () => {
        const catalogo = [...catalog, { id: 'adm-rh', parent_id: 'adm', code: '004', name: 'RH' }];
        const tree = buildCostCenterTree([
            row('adm', 'Administrativo', 149, -34482),
            row('adm-rh', 'Administrativo › RH', 3, -100),
        ], catalogo);
        const adm = tree[0];
        expect(adm.totals.qtd).toBe(152);
        expect(adm.totals.realizado).toBe(-34582);
        expect(adm.children[0]).toMatchObject({ name: LANCADO_NO_GRUPO_LABEL, synthetic: true, key: 'adm', depth: 1 });
        expect(adm.children[1].name).toBe('RH');
    });

    it('grupo só com lançamentos diretos vira folha na raiz (sem filho sintético)', () => {
        const tree = buildCostCenterTree([row('adm', 'Administrativo', 149, -34482)], catalog);
        expect(tree).toHaveLength(1);
        expect(tree[0]).toMatchObject({ name: 'Administrativo', depth: 0, children: [] });
        expect(tree[0].totals.qtd).toBe(149);
    });

    it('grupos sem nenhum lançamento no período ficam de fora', () => {
        const tree = buildCostCenterTree([row('manut', 'Ativos › Manutenção', 1)], catalog);
        expect(tree.map(n => n.name)).toEqual(['Ativos']);
    });

    it('"— Sem centro de custo" fica por último; centro fora do catálogo vira raiz solta com o rótulo da RPC', () => {
        const tree = buildCostCenterTree([
            row(null, SEM_CENTRO_LABEL, 522, -148835),
            row('zzz-excluido', 'Centro apagado', 2, -10),
            row('manut', 'Ativos › Manutenção', 1),
        ], catalog);
        expect(tree.map(n => n.name)).toEqual(['Ativos', 'Centro apagado', SEM_CENTRO_LABEL]);
        expect(tree[2].key).toBeNull();
        expect(tree[2].totals.qtd).toBe(522);
    });

    it('a soma das raízes bate com a soma das linhas planas', () => {
        const rows = [
            row(null, SEM_CENTRO_LABEL, 522, -148835, 10, 5),
            row('adm', 'Administrativo', 149, -34482, 0, 200),
            row('bella', '…', 50, -23817),
            row('galeria', '…', 12, 0, 500),
            row('manut', '…', 1, 0, -360),
        ];
        const tree = buildCostCenterTree(rows, catalog);
        const soma = tree.reduce((a, n) => a + n.totals.realizado, 0);
        expect(soma).toBe(rows.reduce((a, r) => a + r.realizado, 0));
        expect(tree.reduce((a, n) => a + n.totals.qtd, 0)).toBe(734);
    });
});

describe('flattenCostCenterTree', () => {
    it('só desce nos grupos expandidos', () => {
        const tree = buildCostCenterTree([
            row('bella', '…', 50), row('galeria', '…', 12), row('manut', '…', 1),
        ], catalog);
        expect(flattenCostCenterTree(tree, new Set()).map(n => n.name)).toEqual(['Condomínios', 'Ativos']);
        expect(flattenCostCenterTree(tree, new Set(['cond'])).map(n => n.name))
            .toEqual(['Condomínios', '010 - Galeria Altavista', '007 - Bella Vista', 'Ativos']);
    });
});
