/**
 * Covenants e obrigações contratuais (PRD item 9).
 *
 * Apuração **híbrida**, decisão do usuário em 2026-08-30: automática onde o
 * sistema sabe calcular, manual com evidência no resto.
 *
 * ⚠️ Por que "Dívida líquida/EBITDA" NÃO é automática: dívida líquida exige
 * saldo de caixa, e não há de onde tirar. Medido em 30/08 contra o banco real —
 * 1 de 2.300 lançamentos tem `payment_account_id`, e nenhuma das 4
 * `payment_accounts` tem `opening_balance`. O covenant vira SEMIAUTOMATICA: o
 * sistema calcula assim que o usuário informar o caixa do período.
 *
 * Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
 */

import { supabase } from '../lib/supabase';

export type CovenantKind =
    | 'DIVIDA_BRUTA_EBITDA' | 'DIVIDA_LIQUIDA_EBITDA' | 'DSCR'
    | 'LIMITE_ENDIVIDAMENTO' | 'VALIDADE_GARANTIAS'
    | 'PL_MINIMO' | 'SALDO_BANCARIO_MINIMO' | 'INDICE_LIQUIDEZ'
    | 'LIMITE_DIVIDENDOS' | 'ENVIO_BALANCO' | 'SEGURO_OBRIGATORIO'
    | 'RESTRICAO_NOVAS_DIVIDAS' | 'OUTRO';

export type CovenantApuracao = 'AUTOMATICA' | 'SEMIAUTOMATICA' | 'MANUAL';
export type CovenantSituacao = 'REGULAR' | 'ATENCAO' | 'VIOLADO' | 'NAO_APURADO';
export type CovenantComparator = 'MAX' | 'MIN';
export type CovenantPeriodicity = 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export interface DebtCovenant {
    id: string;
    organizationId: string;
    debtContractId?: string;
    companyId?: string;
    name: string;
    kind: CovenantKind;
    formula?: string;
    apuracao: CovenantApuracao;
    periodicity: CovenantPeriodicity;
    /** MAX = teto (não pode passar). MIN = piso (não pode ficar abaixo). */
    comparator: CovenantComparator;
    threshold: number;
    warningMarginPct: number;
    unit?: string;
    responsible?: string;
    isActive: boolean;
    notes?: string;
}

export type DebtCovenantInput = Omit<DebtCovenant, 'id' | 'organizationId'> &
    Partial<Pick<DebtCovenant, 'id'>>;

export interface DebtCovenantMeasurement {
    id: string;
    organizationId: string;
    covenantId: string;
    referenceDate: string;
    apurado?: number;
    situacao: CovenantSituacao;
    margemPct?: number;
    inputs?: Record<string, unknown>;
    evidenceUrl?: string;
    notes?: string;
    created_at?: string;
}

/** O que `fn_debt_covenant_evaluate` devolve, sem gravar. */
export interface CovenantEvaluation {
    apurado?: number;
    situacao: CovenantSituacao;
    margemPct?: number;
    inputs?: Record<string, unknown>;
}

/**
 * Como cada tipo é apurado. `AUTOMATICA` sai de `fn_debt_position` +
 * `fn_dre_summary`; `SEMIAUTOMATICA` precisa do caixa; o resto é manual.
 */
export const COVENANT_APURACAO_PADRAO: Record<CovenantKind, CovenantApuracao> = {
    DIVIDA_BRUTA_EBITDA: 'AUTOMATICA',
    DSCR: 'AUTOMATICA',
    LIMITE_ENDIVIDAMENTO: 'AUTOMATICA',
    VALIDADE_GARANTIAS: 'AUTOMATICA',
    DIVIDA_LIQUIDA_EBITDA: 'SEMIAUTOMATICA',
    PL_MINIMO: 'MANUAL',
    SALDO_BANCARIO_MINIMO: 'MANUAL',
    INDICE_LIQUIDEZ: 'MANUAL',
    LIMITE_DIVIDENDOS: 'MANUAL',
    ENVIO_BALANCO: 'MANUAL',
    SEGURO_OBRIGATORIO: 'MANUAL',
    RESTRICAO_NOVAS_DIVIDAS: 'MANUAL',
    OUTRO: 'MANUAL',
};

export const COVENANT_KIND_PT: Record<CovenantKind, string> = {
    DIVIDA_BRUTA_EBITDA: 'Dívida bruta / EBITDA',
    DIVIDA_LIQUIDA_EBITDA: 'Dívida líquida / EBITDA',
    DSCR: 'Cobertura do serviço da dívida (DSCR)',
    LIMITE_ENDIVIDAMENTO: 'Limite de endividamento',
    VALIDADE_GARANTIAS: 'Garantias com avaliação vencida',
    PL_MINIMO: 'Patrimônio líquido mínimo',
    SALDO_BANCARIO_MINIMO: 'Saldo bancário mínimo',
    INDICE_LIQUIDEZ: 'Índice de liquidez',
    LIMITE_DIVIDENDOS: 'Limite de distribuição de dividendos',
    ENVIO_BALANCO: 'Obrigação de envio de balanços',
    SEGURO_OBRIGATORIO: 'Seguro obrigatório',
    RESTRICAO_NOVAS_DIVIDAS: 'Restrição para novas dívidas',
    OUTRO: 'Condição específica do contrato',
};

export const COVENANT_SITUACAO_PT: Record<CovenantSituacao, string> = {
    REGULAR: 'Regular',
    ATENCAO: 'Atenção',
    VIOLADO: 'Violado',
    NAO_APURADO: 'Não apurado',
};

const COVENANT_COLS =
    'id, organization_id, debt_contract_id, company_id, name, kind, formula, apuracao, periodicity, comparator, threshold, warning_margin_pct, unit, responsible, is_active, notes';

const MEASUREMENT_COLS =
    'id, organization_id, covenant_id, reference_date, apurado, situacao, margem_pct, inputs, evidence_url, notes, created_at';

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const opt = <T>(v: unknown): T | undefined => (v == null ? undefined : (v as T));

function mapCovenant(r: Record<string, unknown>): DebtCovenant {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        debtContractId: opt<string>(r.debt_contract_id),
        companyId: opt<string>(r.company_id),
        name: String(r.name ?? ''),
        kind: r.kind as CovenantKind,
        formula: opt<string>(r.formula),
        apuracao: r.apuracao as CovenantApuracao,
        periodicity: r.periodicity as CovenantPeriodicity,
        comparator: r.comparator as CovenantComparator,
        threshold: num(r.threshold),
        warningMarginPct: num(r.warning_margin_pct),
        unit: opt<string>(r.unit),
        responsible: opt<string>(r.responsible),
        isActive: Boolean(r.is_active),
        notes: opt<string>(r.notes),
    };
}

function mapMeasurement(r: Record<string, unknown>): DebtCovenantMeasurement {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        covenantId: r.covenant_id as string,
        referenceDate: String(r.reference_date ?? ''),
        apurado: r.apurado == null ? undefined : Number(r.apurado),
        situacao: r.situacao as CovenantSituacao,
        margemPct: r.margem_pct == null ? undefined : Number(r.margem_pct),
        inputs: opt<Record<string, unknown>>(r.inputs),
        evidenceUrl: opt<string>(r.evidence_url),
        notes: opt<string>(r.notes),
        created_at: opt<string>(r.created_at),
    };
}

export const debtCovenantService = {

    /** REGRA #5: `organizationId` null = "Todas"; a RLS recorta. */
    async list(organizationId: string | null, debtContractId?: string): Promise<DebtCovenant[]> {
        let query = supabase.from('debt_covenants').select(COVENANT_COLS).order('name');
        if (organizationId) query = query.eq('organization_id', organizationId);
        if (debtContractId) query = query.eq('debt_contract_id', debtContractId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(r => mapCovenant(r as Record<string, unknown>));
    },

    async save(organizationId: string, input: DebtCovenantInput): Promise<DebtCovenant> {
        const linha = {
            organization_id: organizationId,
            debt_contract_id: input.debtContractId ?? null,
            company_id: input.companyId ?? null,
            name: input.name,
            kind: input.kind,
            formula: input.formula ?? null,
            apuracao: input.apuracao,
            periodicity: input.periodicity,
            comparator: input.comparator,
            threshold: input.threshold,
            warning_margin_pct: input.warningMarginPct,
            unit: input.unit ?? null,
            responsible: input.responsible ?? null,
            is_active: input.isActive,
            notes: input.notes ?? null,
        };
        const query = input.id
            ? supabase.from('debt_covenants').update(linha).eq('id', input.id)
            : supabase.from('debt_covenants').insert(linha);
        const { data, error } = await query.select(COVENANT_COLS).single();
        if (error) throw error;
        return mapCovenant(data as Record<string, unknown>);
    },

    async remove(id: string): Promise<void> {
        // `.select('id')` + length: no PostgREST um DELETE que não casa nada é
        // indistinguível de sucesso.
        const { data, error } = await supabase
            .from('debt_covenants').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('Nenhum covenant foi excluído — ele não existe ou você não tem acesso.');
        }
    },

    /**
     * Apura sem gravar. É de propósito: o número passa pelos olhos de alguém
     * antes de virar histórico. Apuração que se grava sozinha é apuração que
     * ninguém revisou.
     */
    async evaluate(covenantId: string, refDate: string, caixa?: number | null): Promise<CovenantEvaluation> {
        const { data, error } = await supabase.rpc('fn_debt_covenant_evaluate', {
            p_covenant_id: covenantId,
            p_ref_date: refDate,
            p_caixa: caixa ?? null,
        });
        if (error) throw error;
        const r = (data as Record<string, unknown>[] | null)?.[0];
        if (!r) return { situacao: 'NAO_APURADO' };
        return {
            apurado: r.apurado == null ? undefined : Number(r.apurado),
            situacao: r.situacao as CovenantSituacao,
            margemPct: r.margem_pct == null ? undefined : Number(r.margem_pct),
            inputs: opt<Record<string, unknown>>(r.inputs),
        };
    },

    async listMeasurements(covenantId: string): Promise<DebtCovenantMeasurement[]> {
        const { data, error } = await supabase
            .from('debt_covenant_measurements')
            .select(MEASUREMENT_COLS)
            .eq('covenant_id', covenantId)
            .order('reference_date', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(r => mapMeasurement(r as Record<string, unknown>));
    },

    /**
     * Grava a apuração do período. `upsert` por (covenant, data) porque
     * reapurar o mesmo trimestre é normal — o que não pode é ficarem duas
     * linhas e o painel mostrar a que a consulta pegou primeiro.
     */
    async saveMeasurement(
        organizationId: string,
        m: Omit<DebtCovenantMeasurement, 'id' | 'organizationId' | 'created_at'>,
    ): Promise<DebtCovenantMeasurement> {
        const { data, error } = await supabase
            .from('debt_covenant_measurements')
            .upsert({
                organization_id: organizationId,
                covenant_id: m.covenantId,
                reference_date: m.referenceDate,
                apurado: m.apurado ?? null,
                situacao: m.situacao,
                margem_pct: m.margemPct ?? null,
                inputs: m.inputs ?? null,
                evidence_url: m.evidenceUrl ?? null,
                notes: m.notes ?? null,
            }, { onConflict: 'covenant_id,reference_date' })
            .select(MEASUREMENT_COLS)
            .single();
        if (error) throw error;
        return mapMeasurement(data as Record<string, unknown>);
    },

    /** Última apuração de cada covenant — é o que o painel de risco mostra. */
    async latestByOrg(organizationId: string | null): Promise<Map<string, DebtCovenantMeasurement>> {
        let query = supabase
            .from('debt_covenant_measurements')
            .select(MEASUREMENT_COLS)
            .order('reference_date', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) throw error;

        const mapa = new Map<string, DebtCovenantMeasurement>();
        for (const r of (data ?? []) as Record<string, unknown>[]) {
            const m = mapMeasurement(r);
            // A consulta vem ordenada por data desc; a primeira de cada
            // covenant é a mais recente.
            if (!mapa.has(m.covenantId)) mapa.set(m.covenantId, m);
        }
        return mapa;
    },
};
