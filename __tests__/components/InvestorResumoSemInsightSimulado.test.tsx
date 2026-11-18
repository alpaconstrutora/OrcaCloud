// @vitest-environment jsdom
/**
 * Resumo do Portal do Investidor (link) — sem o card de "IA" simulada (pedido de 18/11/2026).
 *
 * `aiService.analyzePortfolio` esperava 2 s e devolvia texto fixo: com menos de 2 participações, a
 * "Dica de Diversificação"; com 2 ou mais, "Seu patrimônio de 0 está bem distribuído … valorização
 * média 15% acima do CUB do período" — número inventado, mostrado ao investidor como análise.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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
        getSummaryByToken: () => Promise.resolve({
            valid: true,
            participations: [{ project_id: 'p1', ownership_pct: 10 }, { project_id: 'p2', ownership_pct: 5 }],
            contributions: [],
            projects: [{ id: 'p1', name: 'Garden Cambuhy', settings: {} }, { id: 'p2', name: 'Outro empreendimento', settings: {} }],
        }),
        getReportsByToken: () => Promise.resolve([]),
        getOpportunitiesByToken: () => Promise.resolve([]),
        getAnnouncementsByToken: () => Promise.resolve([]),
        getSpesByToken: () => Promise.resolve([]),
        acknowledgeByToken: () => Promise.resolve({ vote_option: null, acknowledged_at: null }),
    },
    RespostaRecusadaError: class extends Error {},
}));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import InvestorDashboard from '../../components/InvestorDashboard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';

const investidor = { id: 'i1', name: 'Tiago', email: 'tiago@exemplo.com.br', organization_id: 'org' } as never;

describe('Resumo do investidor — sem "IA" simulada', () => {
    it('com 2 participações, nenhum texto de análise inventada aparece (nem depois dos 2 s do simulador)', async () => {
        render(
            <ToastProvider><ConfirmProvider>
                <InvestorDashboard settings={{} as never} organizationId="org" investorProfile={investidor} portalToken="tok" isPreview />
            </ConfirmProvider></ToastProvider>,
        );
        expect((await screen.findAllByText('Garden Cambuhy')).length).toBeGreaterThan(0);
        await new Promise(r => setTimeout(r, 2300));
        expect(document.body.textContent).not.toMatch(/Dica de Diversifica|An[áa]lise de Sa[úu]de|acima do CUB|Analisando sua carteira/);
    }, 10000);
});
