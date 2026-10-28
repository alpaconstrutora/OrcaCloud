import { supabase } from '../lib/supabase';

/**
 * Dashboard financeiro — as duas leituras da tela.
 * Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md
 *
 * As duas RPCs leem o livro único `fn_fi_ledger` (o da Inteligência Financeira): o
 * vencido daqui é o mesmo da Projeção de caixa. O saldo dos bancos vem de
 * `fn_reconciliation_dashboard` (o "saldo que o banco informa"), só de contas ativas.
 */

/** Uma conta ativa: o saldo que o BANCO informou (null = nunca informado) e o calculado. */
export interface DashboardConta {
    conta_id: string;
    conta: string;
    banco: string | null;
    saldo_banco: number | null;
    saldo_banco_data: string | null;
    saldo_banco_origem: 'MANUAL' | 'OFX' | 'ASAAS' | null;
    saldo_calculado: number;
}

export interface DashboardHoje {
    /** Data de São Paulo usada no corte (não a do servidor). */
    hoje: string;
    vencido_receber: number;
    vencido_receber_qtd: number;
    /** Vencimento do título a receber vencido mais antigo (null = nenhum vencido). */
    vencido_receber_desde: string | null;
    vencido_pagar: number;
    vencido_pagar_qtd: number;
    vencido_pagar_desde: string | null;
    receber_7: number;
    receber_7_qtd: number;
    pagar_7: number;
    pagar_7_qtd: number;
    receber_30: number;
    receber_30_qtd: number;
    pagar_30: number;
    pagar_30_qtd: number;
    contas: DashboardConta[];
}

export interface DashboardMes {
    /** Primeiro dia do mês, 'AAAA-MM-DD'. */
    mes: string;
    recebido: number;
    pago: number;
}

export interface DashboardCredor {
    nome: string;
    valor: number;
    qtd: number;
}

export interface DashboardPeriodo {
    recebido: number;
    recebido_qtd: number;
    pago: number;
    pago_qtd: number;
    meses: DashboardMes[];
    /** Os 6 maiores credores dos títulos a pagar com vencimento no período —
     *  só os IDENTIFICADOS (fornecedor ou nome do favorecido). */
    credores: DashboardCredor[];
    credores_qtd: number;
    /** Tudo o que vence a pagar no período, inclusive sem fornecedor. */
    a_pagar_total: number;
    /** Títulos a pagar do período sem fornecedor nem favorecido: falta de cadastro. */
    sem_fornecedor_valor: number;
    sem_fornecedor_qtd: number;
}

// PostgREST devolve numeric como número, mas `jsonb` vindo de numeric(15,2) pode
// chegar como string em versões antigas — normaliza num lugar só.
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOuNulo = (v: unknown): number | null => (v == null ? null : Number(v));

export const financialOverviewService = {
    async getToday(organizationId: string | null): Promise<DashboardHoje> {
        const { data, error } = await supabase.rpc('fn_financial_dashboard_today', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        const d = (data ?? {}) as Record<string, unknown>;
        return {
            hoje: String(d.hoje ?? ''),
            vencido_receber: num(d.vencido_receber),
            vencido_receber_qtd: num(d.vencido_receber_qtd),
            vencido_receber_desde: (d.vencido_receber_desde as string | null) ?? null,
            vencido_pagar: num(d.vencido_pagar),
            vencido_pagar_qtd: num(d.vencido_pagar_qtd),
            vencido_pagar_desde: (d.vencido_pagar_desde as string | null) ?? null,
            receber_7: num(d.receber_7),
            receber_7_qtd: num(d.receber_7_qtd),
            pagar_7: num(d.pagar_7),
            pagar_7_qtd: num(d.pagar_7_qtd),
            receber_30: num(d.receber_30),
            receber_30_qtd: num(d.receber_30_qtd),
            pagar_30: num(d.pagar_30),
            pagar_30_qtd: num(d.pagar_30_qtd),
            contas: ((d.contas ?? []) as Record<string, unknown>[]).map(c => ({
                conta_id: String(c.conta_id),
                conta: String(c.conta ?? ''),
                banco: (c.banco as string | null) ?? null,
                saldo_banco: numOuNulo(c.saldo_banco),
                saldo_banco_data: (c.saldo_banco_data as string | null) ?? null,
                saldo_banco_origem: (c.saldo_banco_origem as DashboardConta['saldo_banco_origem']) ?? null,
                saldo_calculado: num(c.saldo_calculado),
            })),
        };
    },

    async getPeriod(
        organizationId: string | null,
        dateFrom: string,
        dateTo: string,
        monthsFrom: string,
    ): Promise<DashboardPeriodo> {
        const { data, error } = await supabase.rpc('fn_financial_dashboard_period', {
            p_organization_id: organizationId,
            p_date_from: dateFrom,
            p_date_to: dateTo,
            p_months_from: monthsFrom,
        });
        if (error) throw error;
        const d = (data ?? {}) as Record<string, unknown>;
        return {
            recebido: num(d.recebido),
            recebido_qtd: num(d.recebido_qtd),
            pago: num(d.pago),
            pago_qtd: num(d.pago_qtd),
            meses: ((d.meses ?? []) as Record<string, unknown>[]).map(m => ({
                mes: String(m.mes),
                recebido: num(m.recebido),
                pago: num(m.pago),
            })),
            credores: ((d.credores ?? []) as Record<string, unknown>[]).map(c => ({
                nome: String(c.nome ?? ''),
                valor: num(c.valor),
                qtd: num(c.qtd),
            })),
            credores_qtd: num(d.credores_qtd),
            a_pagar_total: num(d.a_pagar_total),
            sem_fornecedor_valor: num(d.sem_fornecedor_valor),
            sem_fornecedor_qtd: num(d.sem_fornecedor_qtd),
        };
    },
};
