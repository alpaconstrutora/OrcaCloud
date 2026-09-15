import { describe, it, expect } from 'vitest';
import { financialRegistryService } from '../services/financialRegistryService';
import { costCenterSelectItems } from '../components/CostCenterSelect';

// Regra de produto (2026-09-15): a conta tem UMA org dona e pode ATENDER outras —
// lista específica ou todas as do usuário. Ver docs/planos/2026-09-15-conta-atende-outras-organizacoes.md
describe('financialRegistryService.servedOrganizationIds', () => {
    const candidatas = ['A', 'B', 'C'];
    it('só a dona: nenhuma outra', () => {
        expect(financialRegistryService.servedOrganizationIds({ organization_id: 'A' }, candidatas)).toEqual([]);
    });
    it('lista específica: a gravada, sem a dona e sem repetição', () => {
        expect(financialRegistryService.servedOrganizationIds(
            { organization_id: 'A', served_organization_ids: ['B', 'A', 'B'] }, candidatas,
        )).toEqual(['B']);
    });
    it('todas: as candidatas menos a dona — nunca NULL/vazio como "todas"', () => {
        expect(financialRegistryService.servedOrganizationIds(
            { organization_id: 'A', serves_all_organizations: true, served_organization_ids: ['B'] }, candidatas,
        )).toEqual(['B', 'C']);
    });
});

describe('costCenterSelectItems — várias organizações', () => {
    const ccs = [
        { id: 'g1', code: '001', name: 'Administrativo', parent_id: null, organization_id: 'A' },
        { id: 'f1', code: '002', name: 'Administrativo > Pro-labore', parent_id: 'g1', organization_id: 'A' },
        { id: 'g2', code: '001', name: 'Obra', parent_id: null, organization_id: 'B' },
    ];
    it('cabeçalho por org; grupo pendura na org, filho continua no grupo', () => {
        const itens = costCenterSelectItems(ccs, new Map([['A', 'Altair'], ['B', 'Alpa']]));
        expect(itens.filter(i => i.selecionavel === false).map(i => i.name)).toEqual(['Altair', 'Alpa']);
        expect(itens.find(i => i.id === 'g1')).toMatchObject({ parentId: 'org:A', parentName: 'Altair' });
        expect(itens.find(i => i.id === 'f1')).toMatchObject({ parentId: 'g1', name: 'Pro-labore' });
        expect(itens.find(i => i.id === 'g2')).toMatchObject({ parentId: 'org:B' });
    });
    it('uma org só: sem cabeçalho (comportamento anterior intacto)', () => {
        const itens = costCenterSelectItems(ccs.filter(c => c.organization_id === 'A'));
        expect(itens.some(i => i.selecionavel === false)).toBe(false);
        expect(itens.find(i => i.id === 'g1')?.parentId).toBeNull();
    });
});
