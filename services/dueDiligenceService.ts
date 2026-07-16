import { supabase } from '../lib/supabase';

export type DueDiligenceCategory = 'imovel' | 'proprietario' | 'tecnica' | 'ambiental';
export type DueDiligenceStatus = 'pendente' | 'em_analise' | 'conforme' | 'inconforme' | 'nao_aplicavel';
export type DueDiligenceCriticidade = 'baixa' | 'media' | 'alta' | 'critica';

export const DD_CATEGORY_LABELS: Record<DueDiligenceCategory, string> = {
    imovel: 'Imóvel',
    proprietario: 'Proprietário',
    tecnica: 'Técnica',
    ambiental: 'Ambiental',
};

export const DD_STATUS_LABELS: Record<DueDiligenceStatus, string> = {
    pendente: 'Pendente',
    em_analise: 'Em análise',
    conforme: 'Conforme',
    inconforme: 'Inconforme',
    nao_aplicavel: 'Não aplicável',
};

export const DD_CRITICIDADE_LABELS: Record<DueDiligenceCriticidade, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    critica: 'Crítica',
};

export interface DueDiligenceItem {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    category: DueDiligenceCategory;
    title: string;
    description?: string | null;
    status: DueDiligenceStatus;
    criticidade: DueDiligenceCriticidade;
    responsavel_email?: string | null;
    due_date?: string | null;
    impacto?: string | null;
    mitigacao?: string | null;
    condicao_aprovacao?: string | null;
    completed_at?: string | null;
    completed_by?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface DueDiligenceFinding {
    id?: string;
    organization_id: string;
    item_id: string;
    document_ref?: string | null;
    evidence_url?: string | null;
    file_hash?: string | null;
    notes?: string | null;
    author_email: string;
    created_at?: string;
}

const ITEM_COLS = 'id, organization_id, opportunity_id, category, title, description, status, criticidade, responsavel_email, due_date, impacto, mitigacao, condicao_aprovacao, completed_at, completed_by, created_at, updated_at';
const FINDING_COLS = 'id, organization_id, item_id, document_ref, evidence_url, file_hash, notes, author_email, created_at';

export const dueDiligenceService = {
    async listItems(opportunityId: string): Promise<DueDiligenceItem[]> {
        const { data, error } = await supabase
            .from('due_diligence_items')
            .select(ITEM_COLS)
            .eq('opportunity_id', opportunityId)
            .order('criticidade', { ascending: false })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []) as DueDiligenceItem[];
    },

    async saveItem(item: Omit<DueDiligenceItem, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<DueDiligenceItem> {
        const payload = { ...item, updated_at: new Date().toISOString() };
        if (item.id) {
            const { data, error } = await supabase
                .from('due_diligence_items')
                .update(payload)
                .eq('id', item.id)
                .select(ITEM_COLS)
                .single();
            if (error) throw error;
            return data as DueDiligenceItem;
        }
        const { data, error } = await supabase
            .from('due_diligence_items')
            .insert(payload)
            .select(ITEM_COLS)
            .single();
        if (error) throw error;
        return data as DueDiligenceItem;
    },

    async deleteItem(id: string): Promise<void> {
        const { error } = await supabase.from('due_diligence_items').delete().eq('id', id);
        if (error) throw error;
    },

    async listFindings(itemId: string): Promise<DueDiligenceFinding[]> {
        const { data, error } = await supabase
            .from('due_diligence_findings')
            .select(FINDING_COLS)
            .eq('item_id', itemId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as DueDiligenceFinding[];
    },

    async addFinding(finding: Omit<DueDiligenceFinding, 'id' | 'created_at'>): Promise<DueDiligenceFinding> {
        const { data, error } = await supabase
            .from('due_diligence_findings')
            .insert(finding)
            .select(FINDING_COLS)
            .single();
        if (error) throw error;
        return data as DueDiligenceFinding;
    },

    async deleteFinding(id: string): Promise<void> {
        const { error } = await supabase.from('due_diligence_findings').delete().eq('id', id);
        if (error) throw error;
    },

    async uploadFindingFile(file: File, organizationId: string): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const filePath = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const { error } = await supabase.storage.from('due-diligence-findings').upload(filePath, file);
        if (error) throw error;
        return filePath;
    },

    async getFindingSignedUrl(path: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from('due-diligence-findings')
            .createSignedUrl(path, 60 * 15);
        if (error) throw error;
        return data.signedUrl;
    },

    /** true se houver ao menos uma pendência crítica/alta ainda não resolvida — bloqueia avanço de gate */
    hasBlockingPendencies(items: DueDiligenceItem[]): boolean {
        return items.some(i =>
            (i.criticidade === 'critica' || i.criticidade === 'alta') &&
            !['conforme', 'nao_aplicavel'].includes(i.status)
        );
    },
};
