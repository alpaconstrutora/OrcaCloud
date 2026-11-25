import { describe, expect, it } from 'vitest';
import {
    MOTIVO_SEM_EDICAO_QUALIDADE, podeEditarQualidadeSiac, podeEditarQualidadeSiacEmTodas,
    podeEditarQualidadeSiacNoContexto, podeVerQualidadeSiac,
} from '../utils/permissaoQualidadeSiac';

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
