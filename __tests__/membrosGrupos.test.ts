import { describe, it, expect } from 'vitest';
import type { OrganizationCustomRole, OrganizationMember } from '../types';
import { agruparMembros, agruparUsuariosConsolidados } from '../utils/membrosGrupos';

/**
 * "Agrupar" da aba Membros (Minha Organização › Usuários, guia de UI §6.12):
 * função na ordem da hierarquia, cargo e mês de entrada, "Sem …" sempre por último.
 */

const membro = (id: string, role: OrganizationMember['role'], extra: Partial<OrganizationMember> = {}): OrganizationMember => ({
    id, name: `Pessoa ${id}`, email: `${id}@x.com`, role, joinedAt: '2026-01-10', permissions: {}, ...extra,
} as OrganizationMember);

const CARGOS = [
    { id: 'c-eng', name: 'Engenharia' },
    { id: 'c-adm', name: 'Administrativo' },
] as OrganizationCustomRole[];

const MEMBROS = [
    membro('a', 'member', { customRoleId: 'c-eng', joinedAt: '2026-03-05' }),
    membro('b', 'admin', { customRoleId: 'c-adm', joinedAt: '2026-01-20' }),
    membro('c', 'viewer', { joinedAt: '2026-03-28' }),
    membro('d', 'admin', { customRoleId: 'c-eng', joinedAt: '2025-12-01' }),
];

const rotulos = (g: ReturnType<typeof agruparMembros>) => g.map(x => `${x.label}:${x.itens.length}`);

describe('agruparMembros', () => {
    it('função: Admin → Membro → Visitante (hierarquia, não alfabética); Decrescente inverte', () => {
        expect(rotulos(agruparMembros(MEMBROS, 'funcao', CARGOS, 'asc'))).toEqual(['Admin:2', 'Membro:1', 'Visitante:1']);
        expect(rotulos(agruparMembros(MEMBROS, 'funcao', CARGOS, 'desc'))).toEqual(['Visitante:1', 'Membro:1', 'Admin:2']);
    });

    it('proprietário (sem opção no select da coluna) vem antes do Admin, com nome próprio', () => {
        const g = agruparMembros([...MEMBROS, membro('o', 'owner')], 'funcao', CARGOS, 'asc');
        expect(rotulos(g)).toEqual(['Proprietário:1', 'Admin:2', 'Membro:1', 'Visitante:1']);
    });

    it('cargo: alfabético pelo nome que a célula mostra; quem não tem cargo vai para "Sem cargo", no fim nos dois sentidos', () => {
        expect(rotulos(agruparMembros(MEMBROS, 'cargo', CARGOS, 'asc'))).toEqual(['Administrativo:1', 'Engenharia:2', 'Sem cargo:1']);
        expect(rotulos(agruparMembros(MEMBROS, 'cargo', CARGOS, 'desc'))).toEqual(['Engenharia:2', 'Administrativo:1', 'Sem cargo:1']);
    });

    it('cargo que não está na lista aparece como "Customizado", igual à célula', () => {
        const g = agruparMembros([membro('x', 'member', { customRoleId: 'removido' })], 'cargo', CARGOS, 'asc');
        expect(rotulos(g)).toEqual(['Customizado:1']);
    });

    it('entrada: mês cronológico (mais antigo primeiro); Decrescente = mais recente primeiro', () => {
        expect(rotulos(agruparMembros(MEMBROS, 'entrada', CARGOS, 'asc'))).toEqual(['Dezembro/2025:1', 'Janeiro/2026:1', 'Março/2026:2']);
        expect(rotulos(agruparMembros(MEMBROS, 'entrada', CARGOS, 'desc'))).toEqual(['Março/2026:2', 'Janeiro/2026:1', 'Dezembro/2025:1']);
    });

    it('data de entrada ausente cai em "Sem data de entrada", sempre por último', () => {
        const g = agruparMembros([membro('x', 'member', { joinedAt: '' }), ...MEMBROS], 'entrada', CARGOS, 'desc');
        expect(g[g.length - 1].label).toBe('Sem data de entrada');
    });

    it('mantém a ordem das linhas dentro do grupo (a da coluna ordenada na tela)', () => {
        const g = agruparMembros(MEMBROS, 'funcao', CARGOS, 'asc');
        expect(g[0].itens.map(m => m.id)).toEqual(['b', 'd']);
    });
});

describe('agruparUsuariosConsolidados ("Todos os usuários", topo em Todas)', () => {
    const alpa = { id: 'o1', name: 'Alpa Construtora' };
    const bella = { id: 'o2', name: 'Condomínio Bella Vista' };
    const outraAlpa = { id: 'o3', name: 'Alpa Construtora' };
    const ITENS = [
        { org: bella, member: membro('a', 'owner') },
        { org: alpa, member: membro('b', 'admin') },
        { org: alpa, member: membro('c', 'member') },
        { org: outraAlpa, member: membro('d', 'member') },
    ];
    const r = (g: ReturnType<typeof agruparUsuariosConsolidados>) => g.map(x => `${x.label}:${x.itens.length}`);

    it('organização: A→Z pelo nome da célula; Decrescente inverte; duas orgs com o mesmo nome não se fundem', () => {
        expect(r(agruparUsuariosConsolidados(ITENS, 'organizacao', 'asc'))).toEqual(['Alpa Construtora:2', 'Alpa Construtora:1', 'Condomínio Bella Vista:1']);
        expect(r(agruparUsuariosConsolidados(ITENS, 'organizacao', 'desc'))).toEqual(['Condomínio Bella Vista:1', 'Alpa Construtora:1', 'Alpa Construtora:2']);
    });

    it('função: hierarquia, Decrescente inverte', () => {
        expect(r(agruparUsuariosConsolidados(ITENS, 'funcao', 'asc'))).toEqual(['Proprietário:1', 'Admin:1', 'Membro:2']);
        expect(r(agruparUsuariosConsolidados(ITENS, 'funcao', 'desc'))).toEqual(['Membro:2', 'Admin:1', 'Proprietário:1']);
    });
});
