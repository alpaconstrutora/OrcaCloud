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
//
// ── Plano B (16/11/2026) ────────────────────────────────────────────────────
// O `statement_timeout` de 8 s vale para a chamada INTEIRA, e o cancelamento
// não é pego pelo `EXCEPTION` de cada bloco: um bloco lento derruba os sete
// (foi o que tirou a Central do ar em 16/11, #511). `fontesSeparadas` pede os
// blocos um a um, cada um com o próprio limite — mas SÓ depois que a chamada
// única caiu. Não é o caminho normal: seis RPCs juntas no login é a rajada que
// o bootstrap resolveu. Plano: docs/planos/2026-11-16-central-blocos-isolados.md
import { supabase } from '../lib/supabase';
import { financialIntelligenceService } from './financialIntelligenceService';
import type { FinancialAlert, ProjectScorecard } from './financialIntelligenceService';
import { approvalService } from './approvalService';
import type { ApprovalPendingSummary, ActionQueueItem } from './approvalService';
import { divergenceService } from './divergenceService';
import { processService } from './processService';
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
    meu_dia: FonteDoPainel<MeuDia>;
}

/** Quantidade e valor de um recorte de títulos a pagar. */
export interface QtdValor { qtd: number; valor: number }

export interface TarefaDoDia {
    id: string;
    org_id: string;
    title: string;
    due_date: string;
    priority: 1 | 2 | 3 | 4;
    source_module: string | null;
    source_ref: { type: string; id: string; route?: string } | null;
}

export interface ContaDoDia {
    id: string;
    organization_id: string;
    description: string | null;
    party_name: string | null;
    amount: number;
    due_date: string;
}

/**
 * Bloco `meu_dia` (11/11/2026, tela "Bom dia"). "Hoje" é o dia em São Paulo,
 * calculado no banco. As aprovações pendentes e os alertas não vêm aqui: a
 * tela os lê de `action_queue` (com `pode_aprovar`) e `financial_alerts`.
 */
export interface MeuDia {
    hoje: string;
    tarefas: { pendentes: TarefaDoDia[]; qtd_pendentes: number; concluidas_hoje: number };
    contas_hoje: { pendentes: ContaDoDia[]; qtd_pendentes: number; pagas_hoje: number };
    aprovacoes_hoje: number;
    contas_7_dias: { atrasadas: QtdValor; vencem_em_2_dias: QtdValor; vencem_em_7_dias: QtdValor };
    /** Linhas de extrato (contas ativas): últimos 30 dias e os 30 anteriores. */
    conciliado: { conciliadas: number; pendentes: number; conciliadas_anterior: number; pendentes_anterior: number };
}

/**
 * Plano B: as seis fontes que a tela usa, cada uma na própria RPC, já em voo.
 * `approval_summary` fica de fora — a tela não lê esse bloco.
 */
export interface FontesSeparadas {
    financial_alerts: Promise<FinancialAlert[]>;
    divergences: Promise<ReconciliationDivergences>;
    bottlenecks: Promise<ProcessStepBottleneck[]>;
    action_queue: Promise<ActionQueueItem[]>;
    scorecards: Promise<ProjectScorecard[]>;
    meu_dia: Promise<MeuDia>;
}

/** As chaves que a função SQL devolve — usada para não deixar buraco. */
const FONTES = [
    'financial_alerts', 'divergences', 'approval_summary',
    'bottlenecks', 'action_queue', 'scorecards', 'meu_dia',
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
            // 0 = só as contagens. A Central usa `counts` e `as_of`; as três listas
            // (até 100 linhas cada) eram 115 KB dos 168 KB da resposta (medido
            // 11/11/2026). As listas continuam na tela de Conciliação, que chama
            // `divergenceService` com o próprio limite.
            p_divergence_limit: opcoes.limit ?? 0,
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

    /**
     * Plano B: chamar SÓ quando `bootstrap` rejeitou. As seis saem juntas (nenhum
     * `await` entre elas) e cada promessa assenta sozinha — a tela pinta cada
     * cartão quando o dele chega. Os parâmetros são os do `bootstrap`: trocar
     * aqui faria o número do cartão mudar conforme o caminho que carregou.
     */
    fontesSeparadas(organizationId: string | null): FontesSeparadas {
        const org = organizationId || null;
        const meuDia = async (): Promise<MeuDia> => {
            const { data, error } = await supabase.rpc('fn_central_meu_dia', { p_organization_id: org });
            if (error) throw error;
            return data as MeuDia;
        };
        return {
            financial_alerts: financialIntelligenceService.getAlerts(org),
            divergences: divergenceService.getDivergences(org, { limit: 0 }),
            bottlenecks: processService.getBottlenecks(org),
            action_queue: approvalService.listActionQueue(org),
            scorecards: financialIntelligenceService.getProjectScorecards(org),
            meu_dia: meuDia(),
        };
    },
};
