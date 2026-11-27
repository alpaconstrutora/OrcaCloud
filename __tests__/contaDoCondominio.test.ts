/**
 * Condomínio › Ficha: "Conta do condomínio" (27/11/2026).
 * Plano: docs/planos/2026-11-27-condominio-conta-de-recebimento.md
 */
import { describe, it, expect } from 'vitest';
import { avisoContaAnteriorContinua, gruposDeContas } from '../utils/contaDoCondominio';

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

    it('aviso: conta de OUTRA org que sai da ficha continua atendendo o condomínio', () => {
        const contas = [
            { id: 'sic', name: 'Sicredi', organization_id: 'alpa' },
            { id: 'cx', name: 'Caixa do condomínio', organization_id: 'bv' },
        ];
        expect(avisoContaAnteriorContinua('sic', '', contas, ORGS, 'bv')).toBe(
            'A conta Sicredi (Alpa Construtora) continua atendendo Condomínio Bella Vista, inclusive no Portal do Síndico. '
            + 'Para tirar, desmarque Condomínio Bella Vista em "Atende também" dessa conta, em Minha Organização › Contas.');
        expect(avisoContaAnteriorContinua('sic', 'cx', contas, ORGS, 'bv')).toMatch(/^A conta Sicredi/);
        // nada a avisar: não mudou, não havia conta, a antiga é do próprio condomínio, sem org própria
        expect(avisoContaAnteriorContinua('sic', 'sic', contas, ORGS, 'bv')).toBeNull();
        expect(avisoContaAnteriorContinua(null, 'sic', contas, ORGS, 'bv')).toBeNull();
        expect(avisoContaAnteriorContinua('cx', 'sic', contas, ORGS, 'bv')).toBeNull();
        expect(avisoContaAnteriorContinua('sic', '', contas, ORGS, null)).toBeNull();
    });

    it('inativa só aparece quando é a já gravada', () => {
        const contas = [{ id: 'i', name: 'Antiga', bank: '', organization_id: 'alpa', is_active: false }];
        expect(gruposDeContas(contas, ORGS, '')).toEqual([]);
        expect(gruposDeContas(contas, ORGS, 'i')[0].contas).toEqual([{ id: 'i', rotulo: 'Antiga (inativa)' }]);
    });
});
