/**
 * Módulos da ORGANIZAÇÃO (27/11/2026) — docs/planos/2026-11-27-modulos-por-organizacao.md.
 * Pedido: na org de condomínio, Engenharia não deve estar disponível — para ninguém dela.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    MODULOS_DA_ORGANIZACAO, moduloDaTela, moduloLigadoNaOrg, moduloLigadoNoContexto,
    modulosPermitidos, modulosPermitidosNoContexto, permitidoNaOrg,
} from '../utils/modulosPermitidos';
import type { Organization } from '../types';

type Membro = NonNullable<Organization['members']>[number];
const membro = (email: string, extra: Partial<Membro> = {}): Membro =>
    ({ id: email, name: email, email, role: 'member', joinedAt: '', permissions: {}, ...extra }) as Membro;
const org = (id: string, members: Membro[], settings: Record<string, unknown> = {}): Organization =>
    ({ id, name: id, members, settings }) as unknown as Organization;

const EU = 'eu@x.com';
const usuario = { group: 'USUARIO' };
const condominio = (members: Membro[] = []) => org('condominio', members, { modulos_da_organizacao: { obras: false, compras: false } });

describe('moduloLigadoNaOrg', () => {
    it('sem nada gravado tudo está ligado (nenhuma org muda até alguém desligar)', () => {
        expect(moduloLigadoNaOrg(org('a', []), 'obras')).toBe(true);
        expect(moduloLigadoNaOrg(undefined, 'obras')).toBe(true);
    });

    it('desligado é só `false` explícito', () => {
        const o = condominio();
        expect(moduloLigadoNaOrg(o, 'obras')).toBe(false);
        expect(moduloLigadoNaOrg(o, 'financeiro')).toBe(true);
    });

    it('Riscos, Qualidade (SiAC) e Pós-Obra moram em Engenharia: desligam junto', () => {
        const o = condominio();
        for (const k of ['riscos', 'qualidade_siac', 'quality']) expect(moduloLigadoNaOrg(o, k)).toBe(false);
    });
});

describe('menu (modulosPermitidos) numa organização', () => {
    const base = { activeEmpresa: null, isDevEmail: false };

    it('membro com permissão de obras não vê Engenharia na org que a desligou', () => {
        const eu = membro(EU, { permissions: { canViewBudget: true } as never });
        const m = modulosPermitidos({ ...base, profile: usuario, currentMember: eu, activeOrg: condominio([eu]) });
        expect(m).toMatchObject({ obras: false, riscos: false, qualidade_siac: false, compras: false, financeiro: true });
    });

    it('admin, DESENVOLVEDOR e acesso total também não veem — o módulo não existe na org', () => {
        const o = condominio();
        expect(modulosPermitidos({ ...base, profile: usuario, currentMember: membro(EU, { role: 'admin' }), activeOrg: o }).obras).toBe(false);
        expect(modulosPermitidos({ ...base, profile: { group: 'DESENVOLVEDOR' }, currentMember: null, activeOrg: o }).obras).toBe(false);
        expect(modulosPermitidos({ ...base, isDevEmail: true, profile: usuario, currentMember: null, activeOrg: o }).obras).toBe(false);
    });

    it('membro ainda carregando (sem currentMember) também respeita a org', () => {
        expect(modulosPermitidos({ ...base, profile: usuario, currentMember: null, activeOrg: condominio() }).obras).toBe(false);
    });

    it('Locações desligada fica `false` mesmo onde a leitura não tinha a chave (admin/dev)', () => {
        const o = org('o', [], { modulos_da_organizacao: { rentals: false } });
        const m = modulosPermitidos({ ...base, profile: usuario, currentMember: membro(EU, { role: 'admin' }), activeOrg: o });
        expect(m.rentals).toBe(false);
        expect(m.crm).toBe(true);
    });

    it('sem nada gravado, a leitura é a de antes (admin vê tudo, Locações ligada)', () => {
        const m = modulosPermitidos({ ...base, profile: usuario, currentMember: membro(EU, { role: 'admin' }), activeOrg: org('o', []) });
        expect(m).toMatchObject({ obras: true, rentals: true, compras: true });
    });
});

describe('"Todas as organizações": união respeita a org de cada vínculo', () => {
    const base = { activeEmpresa: null, profile: usuario, currentMember: null, activeOrg: undefined, isDevEmail: false };

    it('Engenharia aparece se outra org do usuário a tem', () => {
        const eu = membro(EU, { role: 'admin' });
        const m = modulosPermitidosNoContexto({ ...base, organizations: [condominio([eu]), org('alpa', [eu])], email: EU });
        expect(m.obras).toBe(true);
    });

    it('some se TODAS as orgs do usuário a desligaram', () => {
        const eu = membro(EU, { role: 'admin' });
        const m = modulosPermitidosNoContexto({ ...base, organizations: [condominio([eu])], email: EU });
        expect(m.obras).toBe(false);
    });

    it('a permissão do usuário e o módulo da org contam NA MESMA org', () => {
        // Engenharia: o usuário tem na org do condomínio (que não tem o módulo) e não tem na Alpa.
        const noCondominio = membro(EU, { permissions: { canViewBudget: true } as never });
        const naAlpa = membro(EU, { permissions: { canViewBudget: false } as never });
        const m = modulosPermitidosNoContexto({ ...base, organizations: [condominio([noCondominio]), org('alpa', [naAlpa])], email: EU });
        expect(m.obras).toBe(false);
    });
});

describe('guard de rota', () => {
    it('permitidoNaOrg recusa o módulo desligado na org, admin inclusive', () => {
        const o = condominio();
        expect(permitidoNaOrg(membro(EU, { role: 'admin' }), o, 'canViewBudget', 'obras')).toBe(false);
        expect(permitidoNaOrg(membro(EU, { role: 'admin' }), o, 'canViewRisks', 'riscos')).toBe(false);
        expect(permitidoNaOrg(membro(EU, { role: 'admin' }), o, 'canViewLabor', 'rh')).toBe(true);
    });

    it('moduloDaTela cobre as telas sem chave de usuário (Financeiro, Diário, Planta…)', () => {
        expect(moduloDaTela('contas-a-pagar')).toBe('financeiro');
        expect(moduloDaTela('tributos-a-pagar')).toBe('financeiro');
        expect(moduloDaTela('project-diary')).toBe('obras');
        expect(moduloDaTela('eng-planejamento')).toBe('obras');
        expect(moduloDaTela('blueprint')).toBe('incorporacao');
        expect(moduloDaTela('dashboard')).toBeUndefined(); // destino do redirecionamento: não pode ser barrado
        expect(moduloDaTela('central')).toBeUndefined();
    });

    it('moduloLigadoNoContexto: org do topo manda; em "Todas" basta uma org; acesso total vê tudo', () => {
        const eu = membro(EU);
        const ctx = { organizations: [condominio([eu])], email: EU, acessoTotal: false };
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: condominio() }, 'obras')).toBe(false);
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: condominio(), acessoTotal: true }, 'obras')).toBe(false);
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: undefined }, 'obras')).toBe(false);
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: undefined, organizations: [condominio([eu]), org('alpa', [eu])] }, 'obras')).toBe(true);
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: undefined, acessoTotal: true }, 'obras')).toBe(true);
        expect(moduloLigadoNoContexto({ ...ctx, activeOrg: undefined, organizations: [] }, 'obras')).toBe(true);
    });

    it('o AppRouter confere a org antes do atalho de desenvolvedor e no fim do guard', () => {
        const router = fs.readFileSync(path.resolve(__dirname, '../components/AppRouter.tsx'), 'utf8');
        const corpo = router.slice(router.indexOf('const isModuleAllowed'));
        expect(corpo.indexOf('moduloLigadoNaOrg(activeOrg, matrixKey)')).toBeGreaterThan(-1);
        expect(corpo.indexOf('moduloLigadoNaOrg(activeOrg, matrixKey)')).toBeLessThan(corpo.indexOf("currentProfile.group === 'DESENVOLVEDOR' || isDevEmail) return true"));
        expect(router).toMatch(/moduloDaTela\(activeView\)/);
    });
});

describe('catálogo do painel', () => {
    const chavesDoMenu = Object.keys(modulosPermitidos({ activeEmpresa: null, profile: { group: 'DESENVOLVEDOR' }, currentMember: null, activeOrg: undefined, isDevEmail: false }));

    it('toda chave do painel é uma chave real do menu', () => {
        for (const m of MODULOS_DA_ORGANIZACAO) expect(chavesDoMenu).toContain(m.chave);
    });

    it('o Layout não passa mais por cima da organização para o desenvolvedor', () => {
        const layout = fs.readFileSync(path.resolve(__dirname, '../components/Layout.tsx'), 'utf8');
        expect(layout).not.toMatch(/mod\.[a-z_]+[^\n&]*\|\|\s*isDev\)/);
    });
});
