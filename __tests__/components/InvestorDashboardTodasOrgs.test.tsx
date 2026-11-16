// @vitest-environment jsdom
/**
 * REGRA #5 (16/11/2026, pedido do usuário: "Se no topo estava todas as organizações e não apareceu.
 * Isso é premissa basica do app"): na visão do gestor, as oportunidades e os relatórios seguem o
 * seletor do topo — "Todas" = sem filtro de organização (a RLS recorta às organizações do usuário).
 * Antes, a lista caía na organização do INVESTOR selecionado (Tiago → Alpa) e as oportunidades da SPE
 * do Garden não apareciam.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ opps: vi.fn(), reports: vi.fn(), topo: { orgId: null as string | null } }));
vi.mock('../../hooks/useOrgContext', async (orig) => ({
    ...(await orig<typeof import('../../hooks/useOrgContext')>()),
    useOrgContext: () => ({ orgId: svc.topo.orgId, isAllOrgs: svc.topo.orgId == null, source: svc.topo.orgId ? 'organization' : 'all' }),
}));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: {
        listOpportunities: (...a: unknown[]) => svc.opps(...a),
        listReports: (...a: unknown[]) => svc.reports(...a),
        listCompetitors: () => Promise.resolve([]),
    },
}));
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    const fim = Promise.resolve({ data: [], error: null });
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'is', 'not', 'or', 'gte', 'lte', 'neq', 'ilike']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => fim.then(ok);
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: null, error: null });
    q.rpc = () => Promise.resolve({ data: null, error: null });
    q.channel = () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) });
    q.removeChannel = () => {};
    q.auth = { getUser: () => Promise.resolve({ data: { user: null } }) };
    return { supabase: q };
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import InvestorDashboard from '../../components/InvestorDashboard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';

const tiago = { id: 'i1', name: 'Tiago', email: null, organization_id: 'alpa' } as never;
const gestor = { group: 'DESENVOLVEDOR', role: 'DEVELOPER' };
const montar = (organizationId?: string) => render(
    <ToastProvider><ConfirmProvider>
        <InvestorDashboard settings={{} as never} organizationId={organizationId} investorProfile={tiago} profile={gestor} activeTab="opportunities" />
    </ConfirmProvider></ToastProvider>,
);

beforeEach(() => {
    svc.opps.mockReset(); svc.reports.mockReset();
    svc.opps.mockResolvedValue([]); svc.reports.mockResolvedValue([]);
});

describe('gestor › investidor › oportunidades segue o topo', () => {
    it('"Todas as organizações": lista sem filtro (não cai na organização do investidor)', async () => {
        svc.topo.orgId = null;
        montar(undefined);
        await waitFor(() => expect(svc.opps).toHaveBeenCalled());
        expect(svc.opps.mock.calls[0][0]).toBeNull();
        expect(svc.reports.mock.calls[0][0]).toBeNull();
    });

    it('organização escolhida no topo: lista dela', async () => {
        svc.topo.orgId = 'spe';
        montar('spe');
        await waitFor(() => expect(svc.opps).toHaveBeenCalled());
        expect(svc.opps.mock.calls[0][0]).toBe('spe');
    });
});
