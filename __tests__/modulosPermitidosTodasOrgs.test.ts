import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
    MODULO_DO_ITEM_DE_BUSCA, modulosPermitidos, modulosPermitidosNoContexto, permitidoNaOrg, uniaoDeModulos,
    vinculosDoUsuario,
} from '../utils/modulosPermitidos';
import type { Organization } from '../types';

// Plano: docs/planos/2026-11-15-permissoes-todas-orgs-busca-truncate.md
type Membro = NonNullable<Organization['members']>[number];
const membro = (email: string, extra: Partial<Membro> = {}): Membro =>
    ({ id: email, name: email, email, role: 'member', joinedAt: '', permissions: {}, ...extra }) as Membro;
const org = (id: string, members: Membro[], settings: Record<string, unknown> = {}): Organization =>
    ({ id, name: id, members, settings }) as unknown as Organization;

const EU = 'eu@x.com';
const profile = { group: 'USUARIO' };

describe('"Todas as organizações" — união das organizações do usuário', () => {
    const alpa = org('alpa', [membro(EU, { permissions: { canViewRisks: false, canViewLabor: true } as never })]);
    const spe = org('spe', [membro(EU, { permissions: { canViewRisks: true, canViewLabor: false } as never })]);
    const alheia = org('alheia', [membro('outro@x.com')]);

    it('vinculosDoUsuario: só as orgs de que o e-mail é membro (sem diferença de caixa)', () => {
        expect(vinculosDoUsuario([alpa, spe, alheia], 'EU@X.com').map(v => v.org.id)).toEqual(['alpa', 'spe']);
        expect(vinculosDoUsuario([alpa], null)).toEqual([]);
    });

    it('uniaoDeModulos: ligado se alguma leitura liga', () => {
        const u = uniaoDeModulos([{ riscos: false, rh: true } as never, { riscos: true, rh: false } as never]);
        expect(u).toMatchObject({ riscos: true, rh: true });
    });

    it('menu em "Todas": módulo desligado numa org e ligado noutra APARECE', () => {
        const m = modulosPermitidosNoContexto({ activeEmpresa: null, profile, currentMember: null, activeOrg: undefined, isDevEmail: false, organizations: [alpa, spe], email: EU });
        expect(m.riscos).toBe(true);
        expect(m.rh).toBe(true);
    });

    it('menu em "Todas": módulo desligado em TODAS as orgs do usuário NÃO aparece (antes aparecia)', () => {
        const so = org('so', [membro(EU, { permissions: { canViewRisks: false } as never })]);
        const antes = modulosPermitidos({ activeEmpresa: null, profile, currentMember: null, activeOrg: undefined, isDevEmail: false });
        const depois = modulosPermitidosNoContexto({ activeEmpresa: null, profile, currentMember: null, activeOrg: undefined, isDevEmail: false, organizations: [so], email: EU });
        expect(depois.riscos).toBe(false);
        expect(antes).not.toHaveProperty('riscos', false); // a leitura antiga não sabia desligar
    });

    it('com organização no topo, nada muda: é a leitura daquela org', () => {
        const m = modulosPermitidosNoContexto({ activeEmpresa: null, profile, currentMember: alpa.members![0], activeOrg: alpa, isDevEmail: false, organizations: [alpa, spe], email: EU });
        expect(m.riscos).toBe(false);
    });

    it('sem vínculo conhecido (organizações carregando) mantém a leitura antiga', () => {
        const base = { activeEmpresa: null, profile, currentMember: null, activeOrg: undefined, isDevEmail: false };
        expect(modulosPermitidosNoContexto({ ...base, organizations: [], email: EU })).toEqual(modulosPermitidos(base));
    });
});

describe('permitidoNaOrg — a regra do guard de rota', () => {
    it('admin libera; permissão do membro manda; matriz do cargo por produto; sem nada gravado libera', () => {
        const o = org('o', [], { module_visibility: { platform: { member: { rh: false } } } });
        expect(permitidoNaOrg(membro(EU, { role: 'admin' }), o, 'canViewLabor', 'rh')).toBe(true);
        expect(permitidoNaOrg(membro(EU, { permissions: { canViewLabor: true } as never }), o, 'canViewLabor', 'rh')).toBe(true);
        expect(permitidoNaOrg(membro(EU), o, 'canViewLabor', 'rh')).toBe(false);
        expect(permitidoNaOrg(membro(EU), o, 'canViewFiscal', 'fiscal')).toBe(true);
    });

    it('herança (padrao) é decidida NA MESMA organização', () => {
        const semRh = membro(EU, { permissions: { canViewLabor: false } as never });
        const comRh = membro(EU, { permissions: { canViewLabor: true } as never });
        const herdaRh = (naOrg: (u: string, m: string) => boolean) => naOrg('canViewLabor', 'rh');
        expect(permitidoNaOrg(semRh, org('a', []), 'canViewTrainings', 'treinamentos', herdaRh)).toBe(false);
        expect(permitidoNaOrg(comRh, org('b', []), 'canViewTrainings', 'treinamentos', herdaRh)).toBe(true);
    });
});

describe('Qualidade (SiAC) — chave própria, herda de Obras', () => {
    const base = { activeEmpresa: null, profile, activeOrg: undefined, isDevEmail: false };

    it('sem nada gravado, qualidade_siac segue obras', () => {
        const sem = membro(EU, { permissions: { canViewBudget: false } as never });
        const com = membro(EU, { permissions: { canViewBudget: true } as never });
        expect(modulosPermitidos({ ...base, currentMember: sem }).qualidade_siac).toBe(false);
        expect(modulosPermitidos({ ...base, currentMember: com }).qualidade_siac).toBe(true);
    });

    it('canViewQualitySystem:false explícito vence obras ligado', () => {
        const m = membro(EU, { permissions: { canViewBudget: true, canViewQualitySystem: false } as never });
        expect(modulosPermitidos({ ...base, currentMember: m }).qualidade_siac).toBe(false);
    });

    it('em "Todas" (sem membro resolvido) segue obras', () => {
        const m = modulosPermitidosNoContexto({ ...base, currentMember: null, organizations: [org('a', [membro(EU, { permissions: { canViewQualitySystem: true, canViewBudget: false } as never })])], email: EU });
        expect(m.qualidade_siac).toBe(true);
        expect(modulosPermitidos({ ...base, currentMember: null }).qualidade_siac).toBe(true);
    });

    it('administrador e desenvolvedor sempre veem', () => {
        expect(modulosPermitidos({ ...base, currentMember: membro(EU, { role: 'admin' }) }).qualidade_siac).toBe(true);
        expect(modulosPermitidos({ ...base, profile: { group: 'DESENVOLVEDOR' }, currentMember: null }).qualidade_siac).toBe(true);
    });
});

describe('busca rápida (Ctrl+K) usa as chaves do menu', () => {
    const layout = fs.readFileSync(path.resolve(__dirname, '../components/Layout.tsx'), 'utf8');
    const chaves = Object.keys(modulosPermitidos({ activeEmpresa: null, profile: { group: 'DESENVOLVEDOR' }, currentMember: null, activeOrg: undefined, isDevEmail: false }));

    it('toda tela mapeada existe na lista da busca do Layout', () => {
        for (const id of Object.keys(MODULO_DO_ITEM_DE_BUSCA)) expect(layout).toContain(`id: '${id}'`);
    });

    it('toda chave mapeada é uma chave real do menu', () => {
        for (const chave of Object.values(MODULO_DO_ITEM_DE_BUSCA)) expect(chaves).toContain(chave);
    });

    it('o Layout filtra a busca por essa tabela', () => {
        expect(layout).toMatch(/MODULO_DO_ITEM_DE_BUSCA\[item\.id\]/);
    });
});
