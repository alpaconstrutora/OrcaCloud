// __tests__/contextTree.test.ts
//
// Agrupamento do seletor de contexto do topo (Organização → Empreendimento →
// Obra). Os casos aqui são as armadilhas que já morderam o módulo de
// empreendimentos antes: vínculo órfão (as colunas não têm FK), empreendimento
// numa SPE enquanto a obra vive na organização do grupo, e obra ligada por
// torre — que some se o join for montado no sentido do empreendimento.
import { describe, it, expect } from 'vitest';
import { buildContextTree } from '../hooks/useContextTree';

const orgs = [
    { id: 'org-b', name: 'Beta Incorporadora' },
    { id: 'org-a', name: 'Alpa Construtora' },
];

const obra = (id: string, name: string, organization_id: string | null) => ({
    id, name, organization_id, settings: { classification: 'OBRA' },
});

describe('buildContextTree', () => {
    it('agrupa obra sob o empreendimento da mesma organização', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p1', 'Torre A', 'org-a')],
            emps: [{ id: 'e1', name: 'Residencial Aurora', organization_id: 'org-a' }],
            obraToEmp: { p1: { id: 'e1', name: 'Residencial Aurora', towerName: 'A' } },
            empresas: [],
        });
        const alpa = tree.find(o => o.id === 'org-a')!;
        expect(alpa.empreendimentos[0].obras.map(o => o.name)).toEqual(['Torre A']);
        expect(alpa.empreendimentos[0].obras[0].towerName).toBe('A');
        expect(alpa.obrasSemEmpreendimento).toEqual([]);
    });

    it('ordena organizações, empreendimentos e obras por nome', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p2', 'Zulu', 'org-a'), obra('p1', 'Alfa', 'org-a')],
            emps: [
                { id: 'e2', name: 'Zênite', organization_id: 'org-a' },
                { id: 'e1', name: 'Aurora', organization_id: 'org-a' },
            ],
            obraToEmp: {
                p1: { id: 'e1', name: 'Aurora' },
                p2: { id: 'e1', name: 'Aurora' },
            },
            empresas: [],
        });
        expect(tree.map(o => o.name)).toEqual(['Alpa Construtora', 'Beta Incorporadora']);
        const alpa = tree[0];
        expect(alpa.empreendimentos.map(e => e.name)).toEqual(['Aurora', 'Zênite']);
        expect(alpa.empreendimentos[0].obras.map(o => o.name)).toEqual(['Alfa', 'Zulu']);
    });

    it('joga em "Sem empreendimento" a obra sem vínculo', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p1', 'Coronel Lambert 345', 'org-a')],
            emps: [],
            obraToEmp: {},
            empresas: [],
        });
        expect(tree.find(o => o.id === 'org-a')!.obrasSemEmpreendimento.map(o => o.name))
            .toEqual(['Coronel Lambert 345']);
    });

    it('joga em "Sem empreendimento" o vínculo órfão (id que não existe mais)', () => {
        // `empreendimentos.project_id` e `empreendimento_towers.project_id` não têm
        // FK: id apontando para nada é estado normal, não erro.
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p1', 'Obra Fantasma', 'org-a')],
            emps: [],
            obraToEmp: { p1: { id: 'e-apagado', name: 'Empreendimento apagado' } },
            empresas: [],
        });
        expect(tree.find(o => o.id === 'org-a')!.obrasSemEmpreendimento.map(o => o.name))
            .toEqual(['Obra Fantasma']);
    });

    it('não move a obra para a organização do empreendimento (SPE × grupo)', () => {
        // Empreendimento na SPE (org-b), obra na organização do grupo (org-a).
        // A obra tem de continuar aparecendo onde o usuário a procura: em org-a.
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p1', 'Obra do Grupo', 'org-a')],
            emps: [{ id: 'e1', name: 'SPE Aurora', organization_id: 'org-b' }],
            obraToEmp: { p1: { id: 'e1', name: 'SPE Aurora' } },
            empresas: [],
        });
        expect(tree.find(o => o.id === 'org-a')!.obrasSemEmpreendimento.map(o => o.name))
            .toEqual(['Obra do Grupo']);
        expect(tree.find(o => o.id === 'org-b')!.empreendimentos[0].obras).toEqual([]);
    });

    it('descarta orçamento e planejamento (regra #3)', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [
                obra('p1', 'Obra de verdade', 'org-a'),
                { id: 'p2', name: 'Orçamento X', organization_id: 'org-a', settings: { classification: 'ORCAMENTO' } },
                { id: 'p3', name: 'Planejamento Y', organization_id: 'org-a', settings: { classification: 'PLANEJAMENTO' } },
                { id: 'p4', name: 'Sem classificação', organization_id: 'org-a', settings: {} },
            ],
            emps: [],
            obraToEmp: {},
            empresas: [],
        });
        expect(tree.find(o => o.id === 'org-a')!.obrasSemEmpreendimento.map(o => o.name))
            .toEqual(['Obra de verdade']);
    });

    it('ignora obra de organização que o usuário não tem na lista', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [obra('p1', 'Obra de fora', 'org-zzz'), obra('p2', 'Obra sem org', null)],
            emps: [],
            obraToEmp: {},
            empresas: [],
        });
        expect(tree.flatMap(o => o.obrasSemEmpreendimento)).toEqual([]);
    });

    it('pendura as empresas na organização delas, com nome de fantasia quando existe', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [],
            emps: [],
            obraToEmp: {},
            empresas: [
                { id: 'c1', org_id: 'org-a', razao_social: 'Alpa Construtora LTDA', nome_fantasia: 'Alpa', cor_sistema: '#f00' },
                { id: 'c2', org_id: 'org-b', razao_social: 'Beta SPE 01', nome_fantasia: null },
            ],
        });
        expect(tree.find(o => o.id === 'org-a')!.empresas).toEqual([{ id: 'c1', name: 'Alpa', cor: '#f00' }]);
        expect(tree.find(o => o.id === 'org-b')!.empresas).toEqual([{ id: 'c2', name: 'Beta SPE 01', cor: null }]);
    });

    it('mantém o empreendimento sem obra na árvore', () => {
        const tree = buildContextTree({
            organizations: orgs,
            projectRows: [],
            emps: [{ id: 'e1', name: 'Aurora', organization_id: 'org-a' }],
            obraToEmp: {},
            empresas: [],
        });
        expect(tree.find(o => o.id === 'org-a')!.empreendimentos).toEqual([
            { id: 'e1', name: 'Aurora', code: null, obras: [] },
        ]);
    });
});
