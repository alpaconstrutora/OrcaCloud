import { describe, it, expect } from 'vitest';
import {
    buildCostCenterRows, rotuloDoGrupo,
    SEM_CENTRO_LABEL, LANCADO_NO_GRUPO_LABEL,
} from '../utils/opuraCostCenterTree';

// ÒPURA · Relatórios › Centro de Custo: linha plana por centro, com o grupo ao lado
// (docs/planos/2026-11-13-relatorios-centro-de-custo-colunas-agrupar.md).

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

describe('buildCostCenterRows', () => {
    it('põe o grupo (raiz) ao lado de cada centro e ordena grupo → centro por código', () => {
        const linhas = buildCostCenterRows([
            row('manut', 'Ativos › Manutenção', 1, 0, -360),
            row('bella', 'Condomínios › 007 - Bella Vista', 50, -23817),
            row('galeria', 'Condomínios › 010 - Galeria Altavista', 12),
        ], catalog);
        expect(linhas.map(l => [l.groupName, l.code, l.name])).toEqual([
            ['Condomínios', '010', '010 - Galeria Altavista'],
            ['Condomínios', '011', '007 - Bella Vista'],
            ['Ativos', '021', 'Manutenção'],
        ]);
        expect(linhas[1]).toMatchObject({ key: 'bella', groupId: 'cond', groupCode: '006', qtd: 50, realizado: -23817, synthetic: false });
        // O nome vem do cadastro, não do rótulo "Grupo › Centro" da RPC
        expect(linhas.some(l => l.name.includes('›'))).toBe(false);
    });

    it('lançamento gravado direto no grupo vira "(lançado no grupo)" dentro dele, antes dos centros', () => {
        const linhas = buildCostCenterRows([
            row('bella', 'Condomínios › 007 - Bella Vista', 50, -100),
            row('cond', 'Condomínios', 3, -10),
            row('adm', 'Administrativo', 149, -34482),
        ], catalog);
        expect(linhas.map(l => [l.groupName, l.name])).toEqual([
            ['Administrativo', LANCADO_NO_GRUPO_LABEL],
            ['Condomínios', LANCADO_NO_GRUPO_LABEL],
            ['Condomínios', '007 - Bella Vista'],
        ]);
        expect(linhas[1]).toMatchObject({ key: 'cond', synthetic: true, code: null, qtd: 3 });
    });

    it('centro fora do catálogo fica sem grupo; "— Sem centro de custo" vem por último', () => {
        const linhas = buildCostCenterRows([
            row(null, SEM_CENTRO_LABEL, 522, -148835),
            row('apagado', 'Centro apagado', 4, -50),
            row('manut', 'Ativos › Manutenção', 1),
        ], catalog);
        expect(linhas.map(l => l.name)).toEqual(['Manutenção', 'Centro apagado', SEM_CENTRO_LABEL]);
        expect(linhas[1]).toMatchObject({ groupId: null, groupName: null, code: null });
        expect(linhas[2]).toMatchObject({ key: null, groupId: null, qtd: 522 });
    });

    it('centros sem lançamento no período não aparecem (é relatório, não o cadastro)', () => {
        const linhas = buildCostCenterRows([row('manut', 'Ativos › Manutenção', 1)], catalog);
        expect(linhas.map(l => l.key)).toEqual(['manut']);
    });

    it('neto pega a RAIZ como grupo, e ciclo no cadastro não trava', () => {
        const fundo = [
            ...catalog,
            { id: 'neto', parent_id: 'manut', code: '022', name: 'Preventiva' },
            { id: 'a', parent_id: 'b', code: '1', name: 'A' },
            { id: 'b', parent_id: 'a', code: '2', name: 'B' },
        ];
        const linhas = buildCostCenterRows([row('neto', 'x', 1), row('a', 'A', 1)], fundo);
        expect(linhas.find(l => l.key === 'neto')).toMatchObject({ groupId: 'ativos', name: 'Preventiva' });
        expect(linhas.find(l => l.key === 'a')?.groupId).toBeTruthy();
    });

    it('rotuloDoGrupo junta código e nome; sem grupo devolve null', () => {
        expect(rotuloDoGrupo({ groupCode: '006', groupName: 'Condomínios' })).toBe('006 Condomínios');
        expect(rotuloDoGrupo({ groupCode: null, groupName: 'Condomínios' })).toBe('Condomínios');
        expect(rotuloDoGrupo({ groupCode: null, groupName: null })).toBeNull();
    });
});
