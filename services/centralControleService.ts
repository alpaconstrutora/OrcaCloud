// services/centralControleService.ts
// Uma chamada para as seis consultas da Central de Controle.
// Plano: docs/planos/2026-09-24-rpcs-lentas-do-login.md (item C1)
//
// ── Por que existe ──────────────────────────────────────────────────────────
// A tela de entrada disparava seis RPCs de uma vez, por cima das ~17
// requisições da casca do app — pico medido de 17 em voo. Nenhuma delas é
// lenta: `fn_process_bottlenecks` custa 3 ms sozinha e 3.565 ms no pior caso
// em produção (`pg_stat_statements`). O que as derruba é correrem juntas num
// banco pequeno (224 MB de shared_buffers, 2 parallel workers).
//
// `fn_central_controle_bootstrap` executa as seis numa sessão só, em
// sequência: uma conexão, um round-trip, cache aproveitado entre os blocos.
import { supabase } from '../lib/supabase';
import type { FinancialAlert, ProjectScorecard } from './financialIntelligenceService';
import type { ApprovalPendingSummary, ActionQueueItem } from './approvalService';
import type { ReconciliationDivergences, ApprovalStep } from '../types/financial';
import type { ProcessStepBottleneck } from '../types/process';

/**
 * Cada fonte vem com o próprio veredito. É o que preserva a propriedade do
 * `Promise.allSettled` que isto substitui: uma consulta fora do ar não apaga
 * as outras cinco da tela.
 */
export type FonteDoPainel<T> =
    | { ok: true; data: T }
    | { ok: false; erro: string };

export interface CentralControleBootstrap {
    financial_alerts: FonteDoPainel<FinancialAlert[]>;
    divergences: FonteDoPainel<ReconciliationDivergences>;
    approval_summary: FonteDoPainel<ApprovalPendingSummary[]>;
    bottlenecks: FonteDoPainel<ProcessStepBottleneck[]>;
    action_queue: FonteDoPainel<ActionQueueItem[]>;
    scorecards: FonteDoPainel<ProjectScorecard[]>;
}

/** As seis chaves que a função SQL devolve — usada para não deixar buraco. */
const FONTES = [
    'financial_alerts', 'divergences', 'approval_summary',
    'bottlenecks', 'action_queue', 'scorecards',
] as const;

/** Converte uma fonte em `PromiseSettledResult`, para a tela seguir lendo
 *  `.status === 'fulfilled'` como lia antes — o corpo do `load()` não muda. */
export function comoSettled<T>(fonte: FonteDoPainel<T> | undefined, nome: string): PromiseSettledResult<T> {
    if (!fonte) return { status: 'rejected', reason: new Error(`Fonte "${nome}" ausente na resposta do painel.`) };
    return fonte.ok
        ? { status: 'fulfilled', value: fonte.data }
        : { status: 'rejected', reason: new Error(fonte.erro) };
}

export const centralControleService = {
    async bootstrap(
        organizationId: string | null,
        opcoes: { asOf?: string; agingDays?: number; valueTolerance?: number; limit?: number } = {},
    ): Promise<CentralControleBootstrap> {
        const { data, error } = await supabase.rpc('fn_central_controle_bootstrap', {
            p_organization_id: organizationId || null,
            // Os mesmos defaults que `divergenceService.getDivergences` usava —
            // trocar aqui mudaria os números do painel em silêncio.
            p_divergence_as_of: opcoes.asOf ?? new Date().toISOString().split('T')[0],
            p_divergence_aging_days: opcoes.agingDays ?? 5,
            p_divergence_value_tolerance: opcoes.valueTolerance ?? 50,
            p_divergence_limit: opcoes.limit ?? 100,
        });
        if (error) throw error;

        const bruto = (data ?? {}) as Record<string, unknown>;
        // Acumulador solto: `CentralControleBootstrap` é um tipo fechado e não
        // aceita índice por string. A conversão acontece uma vez, no fim, depois
        // que as seis chaves foram preenchidas.
        const saida: Record<string, unknown> = {};
        for (const nome of FONTES) {
            const f = bruto[nome] as { ok?: boolean; data?: unknown; erro?: string } | undefined;
            if (!f || f.ok !== true) {
                saida[nome] = {
                    ok: false,
                    erro: f?.erro ?? `A consulta "${nome}" não voltou na resposta do painel.`,
                };
                continue;
            }
            // `approval_chain` vinha normalizada em `approvalService.listActionQueue`;
            // a normalização acompanha o dado para cá, senão a fila de aprovação
            // recebe `undefined` onde esperava lista e quebra ao renderizar.
            const valor = nome === 'action_queue'
                ? ((f.data ?? []) as ActionQueueItem[]).map(r => ({
                    ...r,
                    approval_chain: (r.approval_chain as unknown as ApprovalStep[]) ?? [],
                }))
                : f.data;
            saida[nome] = { ok: true, data: valor };
        }
        return saida as unknown as CentralControleBootstrap;
    },
};
