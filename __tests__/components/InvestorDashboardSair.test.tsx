// @vitest-environment jsdom
/**
 * Login do investidor por e-mail (Fase 7 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md,
 * 16/11/2026): a mesma casca do link, com "Sair". Pelo link (sem onLogout) segue a faixa "Acesso via link público".
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    const fim = Promise.resolve({ data: [], error: null });
    for (const m of ['from', 'select', 'eq', 'in', 'order', 'limit', 'is', 'not', 'or', 'gte', 'lte', 'neq', 'ilike']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => fim.then(ok);
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: null, error: null });
    q.rpc = () => Promise.resolve({ data: { valid: true }, error: null });
    q.channel = () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) });
    q.removeChannel = () => {};
    q.auth = { getUser: () => Promise.resolve({ data: { user: null } }) };
    return { supabase: q };
});
vi.mock('../../services/investorPortalTokenService', () => ({
    investorPortalTokenService: {
        getSummaryByToken: () => Promise.resolve({ valid: true, participations: [], contributions: [], projects: [] }),
        getReportsByToken: () => Promise.resolve([]),
        getOpportunitiesByToken: () => Promise.resolve([]),
        getAnnouncementsByToken: () => Promise.resolve([]),
        getSpesByToken: () => Promise.resolve([]),
        acknowledgeByToken: () => Promise.resolve(),
    },
}));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import InvestorDashboard from '../../components/InvestorDashboard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';

const investidor = { id: 'i1', name: 'Tiago', email: 'tiago@exemplo.com.br', organization_id: 'org' } as never;
const montar = (onLogout?: () => void) => render(
    <ToastProvider><ConfirmProvider>
        <InvestorDashboard settings={{} as never} organizationId="org" investorProfile={investidor} portalToken="tok" isPreview onLogout={onLogout} />
    </ConfirmProvider></ToastProvider>,
);

describe('casca do investidor: login por e-mail × link', () => {
    it('login por e-mail: "Sair" no menu da conta e no topo do celular; sem a faixa do link', async () => {
        const user = userEvent.setup();
        const sair = vi.fn();
        montar(sair);
        expect(screen.queryByText('Acesso via link público')).toBeNull();
        await user.click(screen.getByRole('button', { name: /Tiago \(INVESTIDOR\)/ }));
        await user.click(screen.getByRole('menuitem', { name: 'Sair' }));
        expect(sair).toHaveBeenCalledTimes(1);
        expect(screen.getAllByRole('button', { name: /Sair/ }).length).toBeGreaterThan(0);
    });

    it('link: a faixa do link e nenhum "Sair"', () => {
        montar();
        expect(screen.getByText('Acesso via link público')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Sair/ })).toBeNull();
    });
});
