import { supabase } from '../lib/supabase';

export type RiskCategory =
    | 'fundiario' | 'juridico' | 'ambiental' | 'urbanistico' | 'tecnico' | 'mercado'
    | 'financeiro' | 'tributario' | 'societario' | 'reputacional' | 'prazo' | 'vendas' | 'construcao';
export type RiskTendencia = 'subindo' | 'estavel' | 'descendo';
export type RiskStatus = 'aberto' | 'em_mitigacao' | 'mitigado' | 'materializado' | 'encerrado';

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
    fundiario: 'Fundiário',
    juridico: 'Jurídico',
    ambiental: 'Ambiental',
    urbanistico: 'Urbanístico',
    tecnico: 'Técnico',
    mercado: 'Mercado',
    financeiro: 'Financeiro',
    tributario: 'Tributário',
    societario: 'Societário',
    reputacional: 'Reputacional',
    prazo: 'Prazo',
    vendas: 'Vendas',
    construcao: 'Construção',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
    aberto: 'Aberto',
    em_mitigacao: 'Em mitigação',
    mitigado: 'Mitigado',
    materializado: 'Materializado',
    encerrado: 'Encerrado',
};

export interface OpportunityRisk {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    category: RiskCategory;
    title: string;
    causa?: string | null;
    consequencia?: string | null;
    probabilidade: number; // 1-5
    impacto: number; // 1-5
    tendencia?: RiskTendencia;
    responsavel_email?: string | null;
    mitigacao?: string | null;
    contingencia?: string | null;
    prazo?: string | null;
    status: RiskStatus;
    created_at?: string;
    updated_at?: string;
}

const RISK_COLS = 'id, organization_id, opportunity_id, category, title, causa, consequencia, probabilidade, impacto, tendencia, responsavel_email, mitigacao, contingencia, prazo, status, created_at, updated_at';

/** Exposição = probabilidade x impacto (1-25). Nível: baixo <6, médio <12, alto <20, crítico >=20 */
export function riskExposure(risk: Pick<OpportunityRisk, 'probabilidade' | 'impacto'>): number {
    return risk.probabilidade * risk.impacto;
}

export function riskLevel(exposure: number): { label: string; color: string } {
    if (exposure >= 20) return { label: 'Crítico', color: 'text-red-600' };
    if (exposure >= 12) return { label: 'Alto', color: 'text-amber-600' };
    if (exposure >= 6) return { label: 'Médio', color: 'text-blue-600' };
    return { label: 'Baixo', color: 'text-gray-500' };
}

export const opportunityRiskService = {
    async listRisks(opportunityId: string): Promise<OpportunityRisk[]> {
        const { data, error } = await supabase
            .from('opportunity_risks')
            .select(RISK_COLS)
            .eq('opportunity_id', opportunityId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return ((data ?? []) as OpportunityRisk[])
            .sort((a, b) => riskExposure(b) - riskExposure(a));
    },

    async saveRisk(risk: Omit<OpportunityRisk, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<OpportunityRisk> {
        const payload = { ...risk, updated_at: new Date().toISOString() };
        if (risk.id) {
            const { data, error } = await supabase
                .from('opportunity_risks')
                .update(payload)
                .eq('id', risk.id)
                .select(RISK_COLS)
                .single();
            if (error) throw error;
            return data as OpportunityRisk;
        }
        const { data, error } = await supabase
            .from('opportunity_risks')
            .insert(payload)
            .select(RISK_COLS)
            .single();
        if (error) throw error;
        return data as OpportunityRisk;
    },

    async deleteRisk(id: string): Promise<void> {
        const { error } = await supabase.from('opportunity_risks').delete().eq('id', id);
        if (error) throw error;
    },
};
