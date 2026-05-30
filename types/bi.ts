// ============================================================
// Módulo: BI Cross-Módulo — Executive Dashboard
// Types — alinhados à migration 20260708000002
// ============================================================

// ────────────────────────────────────────────────────────────
// KPIs por domínio
// ────────────────────────────────────────────────────────────

export interface BIComercial {
    total_deals: number;
    deals_fechados: number;
    taxa_conversao_pct: number | null;
    vgv_fechado: number;
    ticket_medio: number;
}

export interface BISupply {
    total_pedidos: number;
    recebidos: number;
    divergencias: number;
    taxa_divergencia_pct: number | null;
    lead_time_medio_dias: number | null;
}

export interface BIOperacional {
    obras_ativas: number;
    ncs_abertas: number;
    garantia_abertos: number;
    nps_medio: number | null;
}

export interface BIRH {
    headcount: {
        total: number;
        ativos: number;
        afastados: number;
        em_ferias: number;
    };
    periodo: {
        admitidos: number;
        desligados: number;
        turnover_pct: number;
    };
    custos: {
        custo_mes: number;
        horas_extras: number;
    };
    qualidade: {
        absenteismo_pct: number;
    };
    alertas: {
        treinamentos_vencendo: number;
        docs_vencendo: number;
        epis_estoque_baixo: number;
        ferias_vencendo: number;
    };
}

export interface DRESummaryItem {
    linha: string;
    realizado: number;
    previsto: number;
}

// ────────────────────────────────────────────────────────────
// Resposta principal do fn_bi_executive
// ────────────────────────────────────────────────────────────

export interface ExecutiveKPIs {
    period_from: string;
    period_to: string;
    comercial: BIComercial;
    supply: BISupply;
    operacional: BIOperacional;
    dre: DRESummaryItem[];
    rh: BIRH;
}

// ────────────────────────────────────────────────────────────
// Tendência mensal (fn_bi_trend)
// ────────────────────────────────────────────────────────────

export interface BITrendPoint {
    mes: string;
    receita: number;
    custo: number;
    ebitda: number;
    pedidos: number;
    deals_fechados: number;
    obras_ativas: number;
}

// ────────────────────────────────────────────────────────────
// Comparação com metas (company_targets)
// ────────────────────────────────────────────────────────────

export interface KPIvsTarget {
    label: string;
    realizado: number | null;
    meta: number | null;
    unidade: string;             // 'BRL' | '%' | 'un'
    status: 'acima' | 'abaixo' | 'dentro' | 'sem_meta';
    variacao_pct: number | null; // (realizado - meta) / meta * 100
}

export interface BIExecutiveSummary {
    kpis: ExecutiveKPIs;
    trend: BITrendPoint[];
    vsTargets: KPIvsTarget[];
}
