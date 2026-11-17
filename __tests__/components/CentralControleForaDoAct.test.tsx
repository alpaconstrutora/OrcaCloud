// @vitest-environment jsdom
/**
 * Central de Controle FORA do `act()` (docs/planos/2026-11-17-central-caixa-menores.md, Tarefa 4).
 *
 * O Testing Library embrulha tudo em `act()`, que descarrega cada atualização na hora. No
 * navegador, as atualizações de um efeito vão pelo Scheduler e se juntam num lote. Se as
 * respostas do `load` (chamada única, reajustes, alçadas) chegarem antes de o React
 * renderizar a espera ligada, `true → false` no mesmo lote se anula — com a espera no
 * estado BOOLEANO, o efeito do caixa não roda de novo e o caixa da org nova fica em
 * esqueleto para sempre (revisão do #546). Hoje as três passam pela rede; com cache num
 * desses serviços, isto acontece de verdade.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { vi, it, expect } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const estado: Record<string, unknown> = {
    currentProfile: { group: 'USUARIO', role: 'ADMINISTRADOR', email: 'ana@alpa.com.br' },
    organizations: [{ id: 'o1', name: 'Alpa', members: [{ email: 'ana@alpa.com.br', name: 'Ana Souza', role: 'admin' }] }],
    activeOrganizationId: 'o1', companies: [], activeEmpresaId: null, projectsLoading: false,
};
vi.mock('../../store/useStore', () => ({
    useStore: (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(estado) : estado),
}));

const HOJE = '2026-11-11';
const ok = (data: unknown) => ({ ok: true, data });
const painel = () => ({
    financial_alerts: ok([]),
    divergences: ok({ as_of: HOJE, counts: { value_mismatch: 0, bank_without_internal: 0, internal_without_bank: 0 } }),
    approval_summary: ok([]), bottlenecks: ok([]), action_queue: ok([]), scorecards: ok([]),
    meu_dia: ok({
        hoje: HOJE,
        tarefas: { pendentes: [], qtd_pendentes: 0, concluidas_hoje: 0 },
        contas_hoje: { pendentes: [], qtd_pendentes: 0, pagas_hoje: 0 },
        aprovacoes_hoje: 0,
        contas_7_dias: { atrasadas: { qtd: 0, valor: 0 }, vencem_em_2_dias: { qtd: 0, valor: 0 }, vencem_em_7_dias: { qtd: 0, valor: 0 } },
        conciliado: { conciliadas: 0, pendentes: 0, conciliadas_anterior: 0, pendentes_anterior: 0 },
    }),
});

// Respostas instantâneas (microtarefa), como um serviço com cache.
const bootstrap = vi.fn(async () => painel());
vi.mock('../../services/centralControleService', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/centralControleService')>();
    return { ...mod, centralControleService: { bootstrap: (...a: unknown[]) => (bootstrap as (...x: unknown[]) => unknown)(...a), fontesSeparadas: vi.fn() } };
});
vi.mock('../../services/contractIndexService', () => ({ contractIndexService: { listDueForReajuste: async () => [] } }));
vi.mock('../../services/financialApprovalService', () => ({ financialApprovalService: { listConfig: async () => [] } }));
const cashflow = vi.fn(async () => [{ data_ref: HOJE, cr_previsto: 0, db_previsto: 0, saldo_dia: 0, saldo_acum: 1000 }]);
vi.mock('../../services/financialIntelligenceService', () => ({
    financialIntelligenceService: { getCashflowProjection: (...a: unknown[]) => (cashflow as (...x: unknown[]) => unknown)(...a) },
}));
vi.mock('../../services/taskService', () => ({ taskService: { update: async () => undefined } }));
vi.mock('../../components/FinancialApprovalModule', () => ({ ENTITY_TAG: {}, ApproveRejectModal: () => null }));

import CentralControle from '../../components/CentralControle';

// Espera consultando por timer (sem `act`), em vez de tempo fixo: na CI (2–4 vCPU, suíte
// inteira) 200 ms podiam não bastar e a falha pareceria regressão (revisão do #546).
const ate = (f: () => void) => vi.waitFor(f, { timeout: 3000, interval: 5 });

it('troca de org com as respostas já resolvidas: o caixa da org nova sai', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    try {
        root.render(<CentralControle organizationId="o1" userEmail="ana@alpa.com.br" onNavigate={() => {}} />);
        await ate(() => expect(cashflow).toHaveBeenCalledWith('o1', 90));
        root.render(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={() => {}} />);
        await ate(() => expect(bootstrap).toHaveBeenCalledWith('o2'));
        await ate(() => expect(cashflow).toHaveBeenCalledWith('o2', 90));
    } finally {
        root.unmount();
        div.remove();
    }
});
