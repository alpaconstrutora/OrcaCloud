/**
 * Condomínio › Ficha: "Conta do condomínio" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 */
import { describe, it, expect } from 'vitest';
import { gruposDeContas } from '../utils/contaDoCondominio';

const ORGS = [
    { id: 'alpa', name: 'Alpa Construtora' },
    { id: 'bv', name: 'Condomínio Bella Vista' },
];

describe('gruposDeContas', () => {
    it('agrupa por organização (nome da org, em ordem) e põe o banco ao lado do nome', () => {
        const g = gruposDeContas([
            { id: 's', name: 'Sicredi', bank: '748 - Sicredi', organization_id: 'alpa', is_active: true },
            { id: 'a', name: 'Asaas', bank: null as unknown as string, organization_id: 'alpa', is_active: true },
            { id: 'c', name: 'Caixa do condomínio', bank: 'Caixa do condomínio', organization_id: 'bv', is_active: true },
            { id: 'x', name: 'Itaú', bank: '', organization_id: 'desconhecida', is_active: true },
        ], ORGS, '');
        expect(g.map(x => x.orgNome)).toEqual(['Alpa Construtora', 'Condomínio Bella Vista', 'Outra organização']);
        expect(g[0].contas).toEqual([{ id: 'a', rotulo: 'Asaas' }, { id: 's', rotulo: 'Sicredi — 748 - Sicredi' }]);
        expect(g[1].contas).toEqual([{ id: 'c', rotulo: 'Caixa do condomínio' }]);
    });

    it('inativa só aparece quando é a já gravada', () => {
        const contas = [{ id: 'i', name: 'Antiga', bank: '', organization_id: 'alpa', is_active: false }];
        expect(gruposDeContas(contas, ORGS, '')).toEqual([]);
        expect(gruposDeContas(contas, ORGS, 'i')[0].contas).toEqual([{ id: 'i', rotulo: 'Antiga (inativa)' }]);
    });
});
