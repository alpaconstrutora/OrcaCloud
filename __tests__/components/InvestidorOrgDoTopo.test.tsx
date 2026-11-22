// @vitest-environment jsdom
/**
 * Plano docs/planos/2026-11-22-investidor-org-do-topo.md (22/11/2026, pedido do usuário: "Escolhi Construção do
 * Edifício Garden Cambuhy SPE e não apareceu"). Com o topo em "Todas" e uma obra da Alpa carregada no contexto,
 * o InvestorDashboard usava a org da OBRA (`settings.organizationId`) e o "Nova oportunidade" ignorava a org
 * escolhida no modal — o formulário listava os estudos da Alpa (nenhum).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    topo: { orgId: null as string | null },
    escolhidaNoModal: 'garden-spe',
    propsDaSpe: [] as unknown[],
    propsDoRelatorio: [] as unknown[],
}));

vi.mock('../../hooks/useOrgContext', async (orig) => ({
    ...(await orig<typeof import('../../hooks/useOrgContext')>()),
    useOrgContext: () => ({ orgId: h.topo.orgId, isAllOrgs: h.topo.orgId == null, source: h.topo.orgId ? 'organization' : 'all' }),
    // Topo numa org: ela. Em "Todas": a escolhida no modal.
    useOrgWriteTarget: () => ({
        resolveWriteOrg: async () => ({ kind: 'org', orgId: h.topo.orgId ?? h.escolhidaNoModal }),
        orgTargetModal: null,
    }),
}));
vi.mock('../../components/investor/OpportunityForm', () => ({
    default: (p: { organizationId: string }) => <div data-testid="org-do-formulario">{p.organizationId}</div>,
}));
vi.mock('../../components/investor/SpeManager', () => ({
    default: (p: unknown) => { h.propsDaSpe.push(p); return <div>spe</div>; },
}));
vi.mock('../../components/investor/MonthlyReportTrigger', () => ({
    default: (p: unknown) => { h.propsDoRelatorio.push(p); return <div>relatorio</div>; },
}));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: {
        listOpportunities: () => Promise.resolve([]),
        listReports: () => Promise.resolve([]),
        listInterests: () => Promise.resolve([]),
        sociosDoInvestidor: () => Promise.resolve([]),
    },
}));
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    const fim = Promise.resolve({ data: [], error: null });
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'is', 'not', 'or', 'gte', 'lte', 'neq', 'ilike', 'filter']) q[m] = () => q;
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
import OpportunitiesTab from '../../components/investor/OpportunitiesTab';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';

const gestor = { group: 'DESENVOLVEDOR', role: 'DEVELOPER' };
// A obra carregada no contexto é da Alpa — é o `settings` que o roteador repassa.
const obraDaAlpa = { organizationId: 'alpa' } as never;
const envolver = (el: React.ReactElement) => render(<ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>);

beforeEach(() => {
    h.topo.orgId = null;
    h.propsDaSpe.length = 0;
    h.propsDoRelatorio.length = 0;
});

describe('Nova oportunidade usa a org resolvida, nunca a prop', () => {
    it('topo em "Todas" + Garden SPE no modal: o formulário recebe a Garden SPE, mesmo com a prop da Alpa', async () => {
        envolver(
            <OpportunitiesTab opportunities={[]} isAdmin viewMode="list" organizationId="alpa"
                onViewModeChange={() => {}} onDelete={() => {}} onUpdate={() => {}} />,
        );
        fireEvent.click(screen.getByText('Criar primeira oportunidade'));
        expect(await screen.findByTestId('org-do-formulario')).toHaveTextContent('garden-spe');
    });

    it('topo numa org: o formulário recebe a do topo', async () => {
        h.topo.orgId = 'garden-spe';
        envolver(
            <OpportunitiesTab opportunities={[]} isAdmin viewMode="list" organizationId="garden-spe"
                onViewModeChange={() => {}} onDelete={() => {}} onUpdate={() => {}} />,
        );
        fireEvent.click(screen.getByText('Criar primeira oportunidade'));
        expect(await screen.findByTestId('org-do-formulario')).toHaveTextContent('garden-spe');
    });
});

describe('gestor: o painel do investidor segue o topo, não a obra carregada', () => {
    it('SPE: com o topo em "Todas" recebe null (todas), não a org da obra', async () => {
        envolver(<InvestorDashboard settings={obraDaAlpa} profile={gestor} activeTab="spe" />);
        await waitFor(() => expect(h.propsDaSpe.length).toBeGreaterThan(0));
        expect((h.propsDaSpe.at(-1) as { organizationId: unknown }).organizationId).toBeNull();
    });

    it('Relatórios: com o topo em "Todas" recebe null', async () => {
        envolver(<InvestorDashboard settings={obraDaAlpa} profile={gestor} activeTab="relatorios" />);
        await waitFor(() => expect(h.propsDoRelatorio.length).toBeGreaterThan(0));
        expect((h.propsDoRelatorio.at(-1) as { organizationId: unknown }).organizationId).toBeNull();
    });

    it('topo numa org: SPE recebe a do topo', async () => {
        h.topo.orgId = 'garden-spe';
        envolver(<InvestorDashboard settings={obraDaAlpa} profile={gestor} activeTab="spe" />);
        await waitFor(() => expect(h.propsDaSpe.length).toBeGreaterThan(0));
        expect((h.propsDaSpe.at(-1) as { organizationId: unknown }).organizationId).toBe('garden-spe');
    });
});
