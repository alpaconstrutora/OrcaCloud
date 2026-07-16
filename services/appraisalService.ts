import { supabase } from '../lib/supabase';
import { descriptiveStats, confidenceInterval95, linearRegression, estimateGrauFundamentacao, GrauFundamentacao } from '../utils/statistics';

export type AppraisalFinalidade = 'compra_venda' | 'garantia' | 'judicial' | 'seguro' | 'desapropriacao' | 'partilha' | 'outro';
export type AppraisalObjetivo = 'valor_mercado_venda' | 'valor_mercado_locacao' | 'valor_liquidacao_forcada';
export type AppraisalMetodologia = 'comparativo_direto' | 'involutivo' | 'renda' | 'evolutivo' | 'comparativo_custo';
export type AppraisalPropertyType = 'apartamento' | 'casa' | 'terreno' | 'comercial' | 'galpao' | 'outro';
export type AppraisalStatus = 'rascunho' | 'em_elaboracao' | 'concluido' | 'assinado';
export type ComparableSource = 'oferta' | 'venda';

export const APPRAISAL_FINALIDADE_LABELS: Record<AppraisalFinalidade, string> = {
    compra_venda: 'Compra e venda',
    garantia: 'Garantia',
    judicial: 'Judicial',
    seguro: 'Seguro',
    desapropriacao: 'Desapropriação',
    partilha: 'Partilha',
    outro: 'Outro',
};

export const APPRAISAL_OBJETIVO_LABELS: Record<AppraisalObjetivo, string> = {
    valor_mercado_venda: 'Valor de mercado para venda',
    valor_mercado_locacao: 'Valor de mercado para locação',
    valor_liquidacao_forcada: 'Valor de liquidação forçada',
};

export const APPRAISAL_METODOLOGIA_LABELS: Record<AppraisalMetodologia, string> = {
    comparativo_direto: 'Comparativo direto de dados de mercado',
    involutivo: 'Involutivo',
    renda: 'Da renda (capitalização)',
    evolutivo: 'Evolutivo',
    comparativo_custo: 'Comparativo de custo',
};

export const APPRAISAL_PROPERTY_TYPE_LABELS: Record<AppraisalPropertyType, string> = {
    apartamento: 'Apartamento',
    casa: 'Casa',
    terreno: 'Terreno',
    comercial: 'Comercial',
    galpao: 'Galpão',
    outro: 'Outro',
};

export const APPRAISAL_STATUS_LABELS: Record<AppraisalStatus, string> = {
    rascunho: 'Rascunho',
    em_elaboracao: 'Em elaboração',
    concluido: 'Concluído',
    assinado: 'Assinado',
};

export interface AppraisalReport {
    id?: string;
    organization_id: string;
    title: string;
    client_name?: string | null;
    finalidade: AppraisalFinalidade;
    objetivo: AppraisalObjetivo;
    metodologia: AppraisalMetodologia;
    property_address?: string | null;
    property_city?: string | null;
    property_state?: string | null;
    property_type?: AppraisalPropertyType | null;
    property_area_privativa?: number | null;
    property_area_total?: number | null;
    property_typology?: string | null;
    property_description?: string | null;
    data_base: string;
    responsavel_tecnico?: string | null;
    crea_cau?: string | null;
    art_numero?: string | null;
    diagnostico_mercado?: string | null;
    premissas_ressalvas?: string | null;
    notes?: string | null;
    status: AppraisalStatus;
    valor_estimado?: number | null;
    valor_minimo?: number | null;
    valor_maximo?: number | null;
    grau_fundamentacao?: GrauFundamentacao | null;
    created_by_email?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface AppraisalComparable {
    id?: string;
    organization_id: string;
    report_id: string;
    address: string;
    source: ComparableSource;
    area: number;
    price_total: number;
    fator_oferta: number;
    fator_localizacao: number;
    fator_area: number;
    fator_estado_conservacao: number;
    fator_outros: number;
    distance_km?: number | null;
    data_coleta?: string | null;
    notes?: string | null;
    created_at?: string;
}

export interface AppraisalCalculation {
    homogenizedUnitPrices: number[];
    stats: ReturnType<typeof descriptiveStats>;
    confidenceInterval: { lower: number; upper: number };
    grauFundamentacao: GrauFundamentacao;
    valorEstimado: number;
    valorMinimo: number;
    valorMaximo: number;
    regression: ReturnType<typeof linearRegression>;
}

const REPORT_COLS = 'id, organization_id, title, client_name, finalidade, objetivo, metodologia, property_address, property_city, property_state, property_type, property_area_privativa, property_area_total, property_typology, property_description, data_base, responsavel_tecnico, crea_cau, art_numero, diagnostico_mercado, premissas_ressalvas, notes, status, valor_estimado, valor_minimo, valor_maximo, grau_fundamentacao, created_by_email, created_at, updated_at';
const COMPARABLE_COLS = 'id, organization_id, report_id, address, source, area, price_total, fator_oferta, fator_localizacao, fator_area, fator_estado_conservacao, fator_outros, distance_km, data_coleta, notes, created_at';

/** Preço unitário (R$/m²) homogeneizado pelos fatores cadastrados */
export function homogenizedUnitPrice(c: AppraisalComparable): number {
    if (c.area <= 0) return 0;
    const unitPrice = c.price_total / c.area;
    return unitPrice * c.fator_oferta * c.fator_localizacao * c.fator_area * c.fator_estado_conservacao * c.fator_outros;
}

/** Calcula o resultado do método comparativo direto a partir dos comparáveis homogeneizados */
export function calculateAppraisal(comparables: AppraisalComparable[], targetArea?: number | null): AppraisalCalculation {
    const homogenizedUnitPrices = comparables.map(homogenizedUnitPrice);
    const stats = descriptiveStats(homogenizedUnitPrices);
    const confidenceInterval = confidenceInterval95(stats);
    const grauFundamentacao = estimateGrauFundamentacao(stats);
    const area = targetArea ?? 0;
    const regression = linearRegression(comparables.map(c => c.area), comparables.map(c => c.price_total));

    return {
        homogenizedUnitPrices,
        stats,
        confidenceInterval,
        grauFundamentacao,
        valorEstimado: stats.mean * area,
        valorMinimo: confidenceInterval.lower * area,
        valorMaximo: confidenceInterval.upper * area,
        regression,
    };
}

export const appraisalService = {
    async listReports(organizationId: string): Promise<AppraisalReport[]> {
        const { data, error } = await supabase
            .from('appraisal_reports')
            .select(REPORT_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as AppraisalReport[];
    },

    async getReport(id: string): Promise<AppraisalReport | null> {
        const { data, error } = await supabase
            .from('appraisal_reports')
            .select(REPORT_COLS)
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data as AppraisalReport | null;
    },

    async saveReport(report: Omit<AppraisalReport, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<AppraisalReport> {
        const payload = { ...report, updated_at: new Date().toISOString() };
        if (report.id) {
            const { data, error } = await supabase
                .from('appraisal_reports')
                .update(payload)
                .eq('id', report.id)
                .select(REPORT_COLS)
                .single();
            if (error) throw error;
            return data as AppraisalReport;
        }
        const { data, error } = await supabase
            .from('appraisal_reports')
            .insert(payload)
            .select(REPORT_COLS)
            .single();
        if (error) throw error;
        return data as AppraisalReport;
    },

    async deleteReport(id: string): Promise<void> {
        const { error } = await supabase.from('appraisal_reports').delete().eq('id', id);
        if (error) throw error;
    },

    async listComparables(reportId: string): Promise<AppraisalComparable[]> {
        const { data, error } = await supabase
            .from('appraisal_comparables')
            .select(COMPARABLE_COLS)
            .eq('report_id', reportId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as AppraisalComparable[];
    },

    async saveComparable(comparable: Omit<AppraisalComparable, 'id' | 'created_at'> & { id?: string }): Promise<AppraisalComparable> {
        if (comparable.id) {
            const { data, error } = await supabase
                .from('appraisal_comparables')
                .update(comparable)
                .eq('id', comparable.id)
                .select(COMPARABLE_COLS)
                .single();
            if (error) throw error;
            return data as AppraisalComparable;
        }
        const { data, error } = await supabase
            .from('appraisal_comparables')
            .insert(comparable)
            .select(COMPARABLE_COLS)
            .single();
        if (error) throw error;
        return data as AppraisalComparable;
    },

    async deleteComparable(id: string): Promise<void> {
        const { error } = await supabase.from('appraisal_comparables').delete().eq('id', id);
        if (error) throw error;
    },

    /** Recalcula e persiste o resultado (valor estimado/mín/máx/grau) a partir dos comparáveis atuais */
    async recalculateAndSave(report: AppraisalReport): Promise<AppraisalReport> {
        if (!report.id) return report;
        const comparables = await this.listComparables(report.id);
        const targetArea = report.property_area_privativa ?? report.property_area_total;
        const calc = calculateAppraisal(comparables, targetArea);
        return this.saveReport({
            ...report,
            valor_estimado: calc.valorEstimado || null,
            valor_minimo: calc.valorMinimo || null,
            valor_maximo: calc.valorMaximo || null,
            grau_fundamentacao: comparables.length > 0 ? calc.grauFundamentacao : null,
        });
    },
};
