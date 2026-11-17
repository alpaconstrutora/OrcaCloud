import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { podeVerDiretoria, podeEditarDiretoria, MOTIVO_SEM_EDICAO_DIRETORIA } from '../utils/permissaoDiretoria';
import { MODULO_DO_ITEM_DE_BUSCA, modulosPermitidos, modulosPermitidosNoContexto } from '../utils/modulosPermitidos';
import type { Organization } from '../types';

// Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 4). Regra igual à do banco
// (_diretoria_orgs): só a flag própria liga; acesso total sempre pode; nada herda.
type Membro = NonNullable<Organization['members']>[number];
const membro = (email: string, extra: Partial<Membro> = {}): Membro =>
    ({ id: email, name: email, email, role: 'member', joinedAt: '', permissions: {}, ...extra }) as Membro;
const org = (id: string, members: Membro[]): Organization => ({ id, name: id, members, settings: {} }) as unknown as Organization;
const EU = 'eu@x.com';
const profile = { group: 'USUARIO' };

describe('permissão Diretoria (CEO)', () => {
    it('ver: liga só com canViewDiretoria ou canEditDiretoria', () => {
        expect(podeVerDiretoria({ permissoes: { canViewDiretoria: true }, acessoTotal: false })).toBe(true);
        expect(podeVerDiretoria({ permissoes: { canEditDiretoria: true }, acessoTotal: false })).toBe(true);
        expect(podeVerDiretoria({ permissoes: {}, acessoTotal: false })).toBe(false);
        expect(podeVerDiretoria({ permissoes: undefined, acessoTotal: false })).toBe(false);
        // nada herda: ver Financeiro, Obras ou gerenciar usuários não abre a Diretoria
        expect(podeVerDiretoria({ permissoes: { canViewFinancial: true, canManageUsers: true, canViewBudget: true }, acessoTotal: false })).toBe(false);
    });

    it('editar: só canEditDiretoria', () => {
        expect(podeEditarDiretoria({ permissoes: { canViewDiretoria: true }, acessoTotal: false })).toBe(false);
        expect(podeEditarDiretoria({ permissoes: { canEditDiretoria: true }, acessoTotal: false })).toBe(true);
    });

    it('acesso total (superadmin) vê e edita sempre', () => {
        expect(podeVerDiretoria({ permissoes: {}, acessoTotal: true })).toBe(true);
        expect(podeEditarDiretoria({ permissoes: {}, acessoTotal: true })).toBe(true);
    });

    it('o motivo do botão desligado diz qual permissão pedir', () => {
        expect(MOTIVO_SEM_EDICAO_DIRETORIA).toContain('Diretoria (CEO) · editar');
    });
});

describe('menu: chave diretoria em modulosPermitidos', () => {
    const base = { activeEmpresa: null, profile, isDevEmail: false };

    it('membro comum sem a flag não vê; com a flag vê', () => {
        const sem = org('a', [membro(EU)]);
        const com = org('a', [membro(EU, { permissions: { canViewDiretoria: true } as never })]);
        expect(modulosPermitidos({ ...base, currentMember: sem.members![0], activeOrg: sem }).diretoria).toBe(false);
        expect(modulosPermitidos({ ...base, currentMember: com.members![0], activeOrg: com }).diretoria).toBe(true);
    });

    it('admin NÃO vê por padrão (a permissão vem desligada para todos)', () => {
        const a = org('a', [membro(EU, { role: 'admin' })]);
        const m = modulosPermitidos({ ...base, currentMember: a.members![0], activeOrg: a });
        expect(m.diretoria).toBe(false);
        expect(m.riscos).toBe(true); // o atalho de admin segue valendo para o resto
    });

    it('admin com a flag vê', () => {
        const a = org('a', [membro(EU, { role: 'admin', permissions: { canViewDiretoria: true } as never })]);
        expect(modulosPermitidos({ ...base, currentMember: a.members![0], activeOrg: a }).diretoria).toBe(true);
    });

    it('grupo DESENVOLVEDOR sem acesso total não vê (o banco não o trata como superadmin)', () => {
        const a = org('a', [membro(EU)]);
        expect(modulosPermitidos({ ...base, profile: { group: 'DESENVOLVEDOR' }, currentMember: a.members![0], activeOrg: a }).diretoria).toBe(false);
    });

    it('acesso total vê', () => {
        expect(modulosPermitidos({ ...base, isDevEmail: true, currentMember: null, activeOrg: undefined }).diretoria).toBe(true);
    });

    it('"Todas": vê se tem a flag em alguma das organizações', () => {
        const a = org('a', [membro(EU)]);
        const b = org('b', [membro(EU, { permissions: { canEditDiretoria: true } as never })]);
        const m = modulosPermitidosNoContexto({ ...base, currentMember: null, activeOrg: undefined, organizations: [a, b], email: EU });
        expect(m.diretoria).toBe(true);
        const so = modulosPermitidosNoContexto({ ...base, currentMember: null, activeOrg: undefined, organizations: [a], email: EU });
        expect(so.diretoria).toBe(false);
    });

    it('a busca rápida (Ctrl+K) esconde a Diretoria de quem não tem a permissão', () => {
        expect(MODULO_DO_ITEM_DE_BUSCA.diretoria).toBe('diretoria');
    });
});

describe('Usuários › padrões e Permissões detalhadas (revisão: admin ganhava a Diretoria por padrão)', () => {
    it('admin e owner NÃO recebem a Diretoria no padrão do papel (o resto continua tudo ligado)', async () => {
        const { getDefaultPermissions } = await import('../components/OrganizationUsers');
        for (const papel of ['admin', 'owner'] as const) {
            const p = getDefaultPermissions(papel) as Record<string, unknown>;
            expect(p.canViewDiretoria).toBe(false);
            expect(p.canEditDiretoria).toBe(false);
            expect(p.canEditRisks).toBe(true);
        }
        for (const papel of ['member', 'viewer'] as const) {
            expect((getDefaultPermissions(papel) as Record<string, unknown>).canViewDiretoria).toBe(false);
        }
    });

    it('"Diretoria (CEO)" tem grupo próprio: marcar o grupo "Geral" não liga a Diretoria', async () => {
        const { DETAILED_PERMISSIONS } = await import('../components/OrganizationUsers');
        const d = DETAILED_PERMISSIONS.find(x => x.view === 'canViewDiretoria')!;
        expect(d.edit).toBe('canEditDiretoria');
        expect(d.group).not.toBe('Geral');
        expect(DETAILED_PERMISSIONS.filter(x => x.group === d.group)).toHaveLength(1);
    });
});

describe('menu em "Todas" para o grupo DESENVOLVEDOR sem acesso total (revisão #14)', () => {
    it('vê a Diretoria se tem a flag em alguma organização — a mesma conta do guard do AppRouter', () => {
        const a = org('a', [membro(EU)]);
        const b = org('b', [membro(EU, { permissions: { canViewDiretoria: true } as never })]);
        const dev = { activeEmpresa: null, profile: { group: 'DESENVOLVEDOR' }, isDevEmail: false, currentMember: null, activeOrg: undefined };
        expect(modulosPermitidosNoContexto({ ...dev, organizations: [a, b], email: EU }).diretoria).toBe(true);
        expect(modulosPermitidosNoContexto({ ...dev, organizations: [a], email: EU }).diretoria).toBe(false);
    });
});
