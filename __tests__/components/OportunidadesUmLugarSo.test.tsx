// @vitest-environment jsdom
/**
 * Plano docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md (25/11/2026), F2 e F3.
 * Pedido: "Oportunidades = o único lugar para gerir oportunidades [...] Sem as 11 abas do investidor" e
 * "Portal do Investidor = gerir investidores e o que cada um vê [...] Oportunidade ali só para ver, sem editar".
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

const rascunho = { id: 'r1', organization_id: 'garden', title: 'Rascunho X', status: 'estudo', is_published: false };
const publicada = { id: 'p1', organization_id: 'garden', title: 'Garden 01', status: 'captacao', is_published: true };

vi.mock('../../hooks/useOrgContext', async (orig) => ({
    ...(await orig<typeof import('../../hooks/useOrgContext')>()),
    useOrgContext: () => ({ orgId: 'garden', isAllOrgs: false, source: 'organization' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: async () => ({ kind: 'org', orgId: 'garden' }), orgTargetModal: null }),
}));
vi.mock('../../components/investor/SpeManager', () => ({ default: () => <div>spe</div> }));
vi.mock('../../components/investor/MonthlyReportTrigger', () => ({ default: () => <div>relatorio</div> }));
vi.mock('../../services/investorPortalService', async (orig) => ({
    ...(await orig<typeof import('../../services/investorPortalService')>()),
    investorPortalService: {
        listOpportunities: () => Promise.resolve([rascunho, publicada]),
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

import OportunidadesModule from '../../components/investor/OportunidadesModule';
import InvestorDashboard from '../../components/InvestorDashboard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';

const gestor = { group: 'DESENVOLVEDOR', role: 'DEVELOPER' };
const envolver = (el: React.ReactElement) => render(<ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>);

describe('Incorporação › Oportunidades (F2)', () => {
    it('o gestor gere ali: Nova Oportunidade, rascunho na lista, Interesses — e nenhuma aba do painel do investidor', async () => {
        envolver(<OportunidadesModule profile={gestor} />);
        expect(await screen.findByRole('button', { name: /Nova Oportunidade/ })).toBeTruthy();
        expect(screen.getAllByText('Rascunho X').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /Interesses/ })).toBeTruthy();
        for (const aba of ['Carteira', 'Fiscal e Tributário', 'Comunicados', 'Espelho de Vendas']) {
            expect(screen.queryByRole('button', { name: aba })).toBeNull();
            expect(screen.queryByRole('tab', { name: aba })).toBeNull();
        }
    });

    it('quem não é gestor só vê as publicadas, sem Nova Oportunidade', async () => {
        envolver(<OportunidadesModule profile={{ group: 'USUARIO', role: 'USER' }} />);
        await waitFor(() => expect(screen.queryByText('Carregando oportunidades...')).toBeNull());
        expect(screen.queryByRole('button', { name: /Nova Oportunidade/ })).toBeNull();
    });
});

describe('Portal do Investidor › investidor › Oportunidades (F3)', () => {
    it('só leitura: as publicadas, sem criar/editar/publicar, com o atalho para gerir em Oportunidades', async () => {
        envolver(
            <InvestorDashboard settings={{} as never} profile={gestor} activeTab="opportunities"
                investorProfile={{ id: 'inv1', name: 'Ana Investidora', organization_id: 'garden' } as never} />,
        );
        expect(await screen.findByRole('button', { name: 'Gerir em Oportunidades' })).toBeTruthy();
        expect(screen.getAllByText('Garden 01').length).toBeGreaterThan(0);
        expect(screen.queryByText('Rascunho X')).toBeNull();
        expect(screen.queryByRole('button', { name: /Nova Oportunidade/ })).toBeNull();
        expect(screen.queryByTitle('Editar')).toBeNull();
        expect(screen.queryByTitle('Despublicar')).toBeNull();
    });
});
