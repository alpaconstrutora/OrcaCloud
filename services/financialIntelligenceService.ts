import { supabase } from '../lib/supabase';

// Todas as RPCs abaixo leem o mesmo livro (fn_fi_ledger) — ver a migration
// aplicar_20271021800000_inteligencia_financeira_numeros_reais.sql. Por isso os
// números de uma aba fecham com os da outra.

export interface FinancialAlert {
    alert_type:   string;
    severity:     'HIGH' | 'MEDIUM' | 'LOW';
    title:        string;
    description:  string;
    amount:       number | null;
    project_id:   string | null;
    project_name: string | null;
    ref_id:       string | null;
}

/** Venda e empreitada contam na obra; locação fica fora (fn_rental_income).
 *  ar_pendente/ap_pendente/saldo_projetado = próximos 90 dias — o mesmo
 *  horizonte do alerta CASHFLOW_RISK. */
export interface ProjectScorecard {
    project_id:        string;
    project_name:      string;
    receita_realizada: number;
    custo_realizado:   number;
    /** 0 quando não há receita — use `tem_receita` para mostrar "—". */
    margem_pct:        number;
    ar_pendente:       number;
    ap_pendente:       number;
    saldo_projetado:   number;
    risco:             'HIGH' | 'MEDIUM' | 'OK';
    ar_vencido:        number;
    ap_vencido:        number;
    tem_receita:       boolean;
}

export interface CashflowProjectionPoint {
    data_ref:    string;
    cr_previsto: number;
    db_previsto: number;
    saldo_dia:   number;
    /** Parte do saldo bancário (fn_cashflow_position.saldo_bancario). */
    saldo_acum:  number;
}

/** Ponto de partida da projeção e o que ficou de fora dela (vencidos). */
export interface CashflowPosition {
    saldo_bancario:           number;
    contas:                   number;
    contas_sem_saldo_inicial: number;
    /** Extrato mais atrasado entre as contas com extrato (YYYY-MM-DD). */
    extrato_ate:              string | null;
    vencido_receber:          number;
    vencido_receber_qtd:      number;
    vencido_pagar:            number;
    vencido_pagar_qtd:        number;
}

export interface RentalIncome {
    empreendimento_id:   string | null;
    empreendimento_nome: string;
    recebido:            number;
    custo:               number;
    a_receber_90d:       number;
    vencido:             number;
}

/** Lançamentos sem obra. natureza 'VENDA' = venda de empreendimento sem obra
 *  (caso legítimo — ex.: 016 Galeria Avenida 494); NULL = despesa/receita da
 *  empresa. */
export interface EntryWithoutProject {
    direction:           'CREDIT' | 'DEBIT';
    natureza:            'VENDA' | null;
    empreendimento_id:   string | null;
    empreendimento_nome: string | null;
    categoria:           string;
    realizado:           number;
    a_vencer_90d:        number;
    vencido:             number;
    qtd:                 number;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** `''` vira `null` ("Todas"): a Central de Controle ainda recebe `activeOrganizationId || ''`
 *  do AppRouter, e `''` numa coluna uuid é 22P02 — a consulta inteira cai. */
const orgOuTodas = (organizationId: string | null) => organizationId || null;

export const financialIntelligenceService = {

    async getAlerts(organizationId: string | null): Promise<FinancialAlert[]> {
        const { data, error } = await supabase.rpc('fn_financial_alerts', {
            p_organization_id: orgOuTodas(organizationId),
        });
        if (error) throw error;
        return ((data || []) as FinancialAlert[]).map(a => ({ ...a, amount: a.amount == null ? null : Number(a.amount) }));
    },

    async getProjectScorecards(organizationId: string | null): Promise<ProjectScorecard[]> {
        const { data, error } = await supabase.rpc('fn_project_scorecard', {
            p_organization_id: orgOuTodas(organizationId),
        });
        if (error) throw error;
        return ((data || []) as ProjectScorecard[]).map(s => ({
            ...s,
            receita_realizada: num(s.receita_realizada),
            custo_realizado:   num(s.custo_realizado),
            margem_pct:        num(s.margem_pct),
            ar_pendente:       num(s.ar_pendente),
            ap_pendente:       num(s.ap_pendente),
            saldo_projetado:   num(s.saldo_projetado),
            ar_vencido:        num(s.ar_vencido),
            ap_vencido:        num(s.ap_vencido),
        }));
    },

    async getCashflowProjection(organizationId: string | null, days = 90): Promise<CashflowProjectionPoint[]> {
        const { data, error } = await supabase.rpc('fn_cashflow_projection', {
            p_organization_id: orgOuTodas(organizationId),
            p_days: days,
        });
        if (error) throw error;
        return ((data || []) as CashflowProjectionPoint[]).map(p => ({
            data_ref:    p.data_ref,
            cr_previsto: num(p.cr_previsto),
            db_previsto: num(p.db_previsto),
            saldo_dia:   num(p.saldo_dia),
            saldo_acum:  num(p.saldo_acum),
        }));
    },

    async getCashflowPosition(organizationId: string | null): Promise<CashflowPosition | null> {
        const { data, error } = await supabase.rpc('fn_cashflow_position', {
            p_organization_id: orgOuTodas(organizationId),
        });
        if (error) throw error;
        const r = ((data || []) as CashflowPosition[])[0];
        if (!r) return null;
        return {
            ...r,
            saldo_bancario:  num(r.saldo_bancario),
            vencido_receber: num(r.vencido_receber),
            vencido_pagar:   num(r.vencido_pagar),
        };
    },

    async getRentalIncome(organizationId: string | null): Promise<RentalIncome[]> {
        const { data, error } = await supabase.rpc('fn_rental_income', {
            p_organization_id: orgOuTodas(organizationId),
        });
        if (error) throw error;
        return ((data || []) as RentalIncome[]).map(r => ({
            ...r,
            recebido:      num(r.recebido),
            custo:         num(r.custo),
            a_receber_90d: num(r.a_receber_90d),
            vencido:       num(r.vencido),
        }));
    },

    async getEntriesWithoutProject(organizationId: string | null): Promise<EntryWithoutProject[]> {
        const { data, error } = await supabase.rpc('fn_entries_without_project', {
            p_organization_id: orgOuTodas(organizationId),
        });
        if (error) throw error;
        return ((data || []) as EntryWithoutProject[]).map(e => ({
            ...e,
            realizado:    num(e.realizado),
            a_vencer_90d: num(e.a_vencer_90d),
            vencido:      num(e.vencido),
        }));
    },
};
