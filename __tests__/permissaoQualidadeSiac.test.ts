import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
    MOTIVO_SEM_EDICAO_QUALIDADE, MOTIVO_SEM_INSPECAO, MOTIVO_SEM_LIBERACAO, podeEditarQualidadeSiac,
    podeEditarQualidadeSiacEmTodas, podeEditarQualidadeSiacNoContexto, podeInspecionarQualidade,
    podeLiberarQualidade, podeVerQualidadeSiac,
} from '../utils/permissaoQualidadeSiac';

describe('fase 2 — inspecionar e aprovar inspeção de serviço controlado (o banco confere o mesmo)', () => {
    const casos = [
        ['inspecionar', podeInspecionarQualidade, 'canInspectQualitySystem'],
        ['liberar', podeLiberarQualidade, 'canReleaseQualitySystem'],
    ] as const;

    for (const [nome, pode, chave] of casos) {
        it(`${nome}: membro sem a chave não pode; nada herda (editar Qualidade/Obras não basta)`, () => {
            expect(pode({ permissoes: {}, papel: 'member', acessoTotal: false })).toBe(false);
            expect(pode({ permissoes: undefined, papel: 'member', acessoTotal: false })).toBe(false);
            expect(pode({
                permissoes: { canEditQualitySystem: true, canEditBudget: true, canEditOperational: true },
                papel: 'member', acessoTotal: false,
            })).toBe(false);
            expect(pode({ permissoes: { [chave]: false }, papel: 'member', acessoTotal: false })).toBe(false);
            expect(pode({ permissoes: {}, papel: null, acessoTotal: false })).toBe(false);
        });
        it(`${nome}: dono e admin sempre podem, mesmo com a chave desligada`, () => {
            expect(pode({ permissoes: { [chave]: false }, papel: 'owner', acessoTotal: false })).toBe(true);
            expect(pode({ permissoes: {}, papel: 'admin', acessoTotal: false })).toBe(true);
        });
        it(`${nome}: a chave true liga; acesso total sempre`, () => {
            expect(pode({ permissoes: { [chave]: true }, papel: 'member', acessoTotal: false })).toBe(true);
            expect(pode({ permissoes: { [chave]: true }, papel: 'viewer', acessoTotal: false })).toBe(true);
            expect(pode({ permissoes: {}, papel: 'viewer', acessoTotal: true })).toBe(true);
        });
    }

    it('a chave de uma não liga a outra', () => {
        expect(podeInspecionarQualidade({ permissoes: { canReleaseQualitySystem: true }, papel: 'member', acessoTotal: false })).toBe(false);
        expect(podeLiberarQualidade({ permissoes: { canInspectQualitySystem: true }, papel: 'member', acessoTotal: false })).toBe(false);
    });

    it('os motivos citam a permissão certa', () => {
        expect(MOTIVO_SEM_INSPECAO).toContain('Qualidade — inspecionar serviço controlado');
        expect(MOTIVO_SEM_LIBERACAO).toContain('Qualidade — aprovar inspeção');
    });

    it('padrão do papel: dono/admin ligadas; membro e visitante com false EXPLÍCITO', async () => {
        const { getDefaultPermissions } = await import('../components/OrganizationUsers');
        for (const papel of ['owner', 'admin'] as const) {
            const p = getDefaultPermissions(papel) as Record<string, unknown>;
            expect(p.canInspectQualitySystem).toBe(true);
            expect(p.canReleaseQualitySystem).toBe(true);
        }
        for (const papel of ['member', 'viewer'] as const) {
            const p = getDefaultPermissions(papel) as Record<string, unknown>;
            expect(p).toHaveProperty('canInspectQualitySystem', false);
            expect(p).toHaveProperty('canReleaseQualitySystem', false);
        }
    });

    it('Permissões detalhadas têm as duas linhas novas', async () => {
        const { DETAILED_PERMISSIONS } = await import('../components/OrganizationUsers');
        const insp = DETAILED_PERMISSIONS.find(x => x.view === 'canInspectQualitySystem');
        const lib = DETAILED_PERMISSIONS.find(x => x.view === 'canReleaseQualitySystem');
        expect(insp?.title).toBe('Qualidade — inspecionar serviço controlado');
        expect(lib?.title).toBe('Qualidade — aprovar inspeção');
        expect(insp?.edit).toBeUndefined();
        expect(lib?.edit).toBeUndefined();
    });
});

describe('podeVerQualidadeSiac — permissão própria → matriz do cargo → herança de Obras', () => {
    it('canViewQualitySystem:false explícito vence obras=true', () => {
        expect(podeVerQualidadeSiac({ permissoes: { canViewQualitySystem: false }, matrizDoCargo: { qualidade_siac: true }, podeVerObras: true })).toBe(false);
    });
    it('canViewQualitySystem:true explícito vence obras=false', () => {
        expect(podeVerQualidadeSiac({ permissoes: { canViewQualitySystem: true }, matrizDoCargo: { qualidade_siac: false }, podeVerObras: false })).toBe(true);
    });
    it('sem a chave própria, a matriz do cargo decide', () => {
        expect(podeVerQualidadeSiac({ permissoes: {}, matrizDoCargo: { qualidade_siac: false }, podeVerObras: true })).toBe(false);
        expect(podeVerQualidadeSiac({ permissoes: undefined, matrizDoCargo: { qualidade_siac: true }, podeVerObras: false })).toBe(true);
    });
    it('sem nada gravado, herda o que Obras decide', () => {
        expect(podeVerQualidadeSiac({ permissoes: {}, matrizDoCargo: {}, podeVerObras: true })).toBe(true);
        expect(podeVerQualidadeSiac({ permissoes: null, matrizDoCargo: null, podeVerObras: false })).toBe(false);
    });
});

describe('podeEditarQualidadeSiac', () => {
    it('administrador sempre edita, mesmo com a chave desligada', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: false }, administrador: true })).toBe(true);
    });
    it('chave própria manda', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: false, canEditBudget: true }, administrador: false })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: true, canEditBudget: false }, administrador: false })).toBe(true);
    });
    it('sem a chave própria, herda canEditBudget', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditBudget: false }, administrador: false })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: { canEditBudget: true }, administrador: false, papel: 'viewer' })).toBe(true);
    });
    it('papel viewer sem nenhuma chave não edita; outro papel edita', () => {
        expect(podeEditarQualidadeSiac({ permissoes: {}, administrador: false, papel: 'viewer' })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: {}, administrador: false, papel: 'member' })).toBe(true);
    });
    it('o motivo da tela só-leitura cita a permissão certa', () => {
        expect(MOTIVO_SEM_EDICAO_QUALIDADE).toContain('Qualidade');
    });
});

describe('podeEditarQualidadeSiacEmTodas — topo em "Todas": edita só se pode em TODAS as organizações', () => {
    const v = (permissions: Record<string, unknown> | undefined, role = 'member') => ({ member: { permissions, role } });

    it('uma organização sem a permissão basta para não editar', () => {
        expect(podeEditarQualidadeSiacEmTodas([
            v({ canEditQualitySystem: true }),
            v({ canEditQualitySystem: false }),
        ], false)).toBe(false);
    });
    it('com a permissão em todas, edita', () => {
        expect(podeEditarQualidadeSiacEmTodas([
            v({ canEditQualitySystem: true }),
            v({ canEditBudget: true }),
            v({}),
        ], false)).toBe(true);
    });
    it('admin numa organização edita nela mesmo com a chave desligada; visitante sem chave não', () => {
        expect(podeEditarQualidadeSiacEmTodas([v({ canEditQualitySystem: false }, 'admin'), v({ canEditQualitySystem: true })], false)).toBe(true);
        expect(podeEditarQualidadeSiacEmTodas([v({}, 'viewer'), v({ canEditQualitySystem: true })], false)).toBe(false);
    });
    it('desenvolvedor edita sempre', () => {
        expect(podeEditarQualidadeSiacEmTodas([v({ canEditQualitySystem: false })], true)).toBe(true);
    });
    it('sem vínculo conhecido (lista de organizações carregando) não bloqueia — o mesmo do guard de rota', () => {
        expect(podeEditarQualidadeSiacEmTodas([], false)).toBe(true);
    });
});

describe('podeEditarQualidadeSiacNoContexto — decide pela organização do useOrgContext, não pelo valor cru do topo', () => {
    const v = (orgId: string, permissions: Record<string, unknown> | undefined, role = 'member') =>
        ({ org: { id: orgId }, member: { permissions, role } });
    // editor em A (sem chave gravada, papel member herda), visitante em B
    const vinculos = [v('org-a', {}), v('org-b', {}, 'viewer')];

    it('organização resolvida (empresa no topo): vale o membro DELA — editor em A edita, mesmo visitante em B', () => {
        expect(podeEditarQualidadeSiacNoContexto({ orgId: 'org-a', isAllOrgs: false, vinculos, acessoTotal: false })).toBe(true);
    });
    it('organização resolvida onde é visitante: só leitura', () => {
        expect(podeEditarQualidadeSiacNoContexto({ orgId: 'org-b', isAllOrgs: false, vinculos, acessoTotal: false })).toBe(false);
    });
    it('"Todas": edita só se pode em todas — visitante em B basta para só leitura', () => {
        expect(podeEditarQualidadeSiacNoContexto({ orgId: null, isAllOrgs: true, vinculos, acessoTotal: false })).toBe(false);
        expect(podeEditarQualidadeSiacNoContexto({ orgId: null, isAllOrgs: true, vinculos: [v('org-a', {})], acessoTotal: false })).toBe(true);
    });
    it('admin da organização resolvida edita com a chave desligada', () => {
        expect(podeEditarQualidadeSiacNoContexto({
            orgId: 'org-b', isAllOrgs: false, vinculos: [v('org-b', { canEditQualitySystem: false }, 'admin')], acessoTotal: false,
        })).toBe(true);
    });
    it('membro da organização resolvida ainda carregando: não bloqueia (o mesmo do guard de rota)', () => {
        expect(podeEditarQualidadeSiacNoContexto({ orgId: 'org-c', isAllOrgs: false, vinculos, acessoTotal: false })).toBe(true);
    });
    it('acesso total (desenvolvedor) edita sempre, em qualquer contexto', () => {
        expect(podeEditarQualidadeSiacNoContexto({ orgId: 'org-b', isAllOrgs: false, vinculos, acessoTotal: true })).toBe(true);
        expect(podeEditarQualidadeSiacNoContexto({ orgId: null, isAllOrgs: true, vinculos, acessoTotal: true })).toBe(true);
    });
});
