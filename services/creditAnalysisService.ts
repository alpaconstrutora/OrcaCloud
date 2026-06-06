import { supabase } from '../lib/supabase';

export type CreditResult = 'PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'REPROVADO';

export interface CreditChecklist {
    rg: boolean;
    cpf: boolean;
    comprov_renda: boolean;
    comprov_residencia: boolean;
    irpf: boolean;
    certidao_negativa: boolean;
    certidao_estado_civil: boolean;
    extratos_bancarios: boolean;
}

export const CHECKLIST_LABELS: Record<keyof CreditChecklist, string> = {
    rg:                   'RG / CNH',
    cpf:                  'CPF',
    comprov_renda:        'Comprovante de renda (3 últimos)',
    comprov_residencia:   'Comprovante de residência',
    irpf:                 'Declaração IRPF (último ano)',
    certidao_negativa:    'Certidão negativa federal',
    certidao_estado_civil:'Certidão de estado civil',
    extratos_bancarios:   'Extratos bancários (3 meses)',
};

export const CHECKLIST_WEIGHTS: Record<keyof CreditChecklist, number> = {
    rg: 10, cpf: 10, comprov_renda: 25, comprov_residencia: 10,
    irpf: 20, certidao_negativa: 10, certidao_estado_civil: 5, extratos_bancarios: 10,
};

export interface DealCreditAnalysis {
    id: string;
    organization_id: string;
    deal_id: string;
    score: number | null;
    result: CreditResult;
    checklist: Partial<CreditChecklist>;
    notes?: string;
    report_pdf_url?: string;
    analyzed_by?: string;
    analyzed_at?: string;
    created_at: string;
    updated_at: string;
}

export function calcScore(checklist: Partial<CreditChecklist>): number {
    return Object.entries(CHECKLIST_WEIGHTS).reduce((total, [key, weight]) => {
        return total + (checklist[key as keyof CreditChecklist] ? weight : 0);
    }, 0);
}

export function suggestResult(score: number): CreditResult {
    if (score >= 80) return 'APROVADO';
    if (score >= 50) return 'EM_ANALISE';
    if (score > 0)   return 'PENDENTE';
    return 'PENDENTE';
}

export const creditAnalysisService = {
    get: async (dealId: string): Promise<DealCreditAnalysis | null> => {
        const { data, error } = await supabase
            .from('deal_credit_analysis')
            .select('id, organization_id, deal_id, score, result, checklist, notes, report_pdf_url, analyzed_by, analyzed_at, created_at, updated_at')
            .eq('deal_id', dealId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    upsert: async (
        organizationId: string,
        dealId: string,
        payload: Partial<Pick<DealCreditAnalysis, 'score' | 'result' | 'checklist' | 'notes' | 'report_pdf_url' | 'analyzed_by' | 'analyzed_at'>>
    ): Promise<DealCreditAnalysis> => {
        const { data, error } = await supabase
            .from('deal_credit_analysis')
            .upsert({ organization_id: organizationId, deal_id: dealId, ...payload }, { onConflict: 'deal_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    uploadReport: async (organizationId: string, dealId: string, file: File): Promise<string> => {
        const ext = file.name.split('.').pop();
        const path = `${organizationId}/${dealId}/laudo-credito.${ext}`;
        const { error } = await supabase.storage.from('credit-analysis').upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('credit-analysis').getPublicUrl(path);
        return publicUrl;
    },
};
