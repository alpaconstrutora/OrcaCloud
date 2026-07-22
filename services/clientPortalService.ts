import { supabase } from '../lib/supabase';

export interface ClientPortalToken {
    id: string;
    org_id: string;
    client_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export interface ClientPortalValidation {
    valid: boolean;
    client_id?: string;
    org_id?: string;
    name?: string;
    email?: string;
    error?: string;
}

export interface PortalPlanningItem {
    id: string;
    startDate?: string;
    endDate?: string;
    duration?: number;
    manualRealPct?: number;
    plannedValue?: number;
    actualValue?: number;
    budgetedValue?: number;
}

export interface PortalPlanningOutlineNode {
    id: string;
    type: 'group' | 'phase' | 'subphase' | 'item' | 'activity';
    name: string;
    budgetItemId?: string;
    children?: PortalPlanningOutlineNode[];
}

export interface PortalPlanningBudgetItem {
    id: string;
    group: string;
    phase: string;
}

export interface PortalPlanning {
    name?: string;
    progress?: number;
    phase?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    outline?: PortalPlanningOutlineNode[] | null;
    itemSchedules?: PortalPlanningItem[];
    budget?: PortalPlanningBudgetItem[];
    financialEnabled?: boolean;
}

export interface PortalGedDocument {
    id: string;
    nome: string;
    descricao?: string;
    categoria: string;
    tipo_documento: string;
    data_validade?: string;
    storage_path?: string;
    mime_type?: string;
    tamanho?: number;
    version_number?: number;
    shared_at: string;
}

export const clientPortalService = {
    async generateToken(clientId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('client_portal_generate_token', {
            p_client_id: clientId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async validateToken(token: string): Promise<ClientPortalValidation> {
        const { data, error } = await supabase.rpc('client_portal_validate_token', { p_token: token });
        if (error) throw error;
        return data as ClientPortalValidation;
    },

    async getPortalData(token: string): Promise<{ valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string }> {
        const { data, error } = await supabase.rpc('client_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string };
    },

    async getContractsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_contracts', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: any[] | null };
        return res.valid ? (res.data ?? []) : [];
    },

    // Aba "Documentos" — GED (opura_documents) compartilhados com o cliente do token,
    // ver migration 20270821000008/9 e o botão "Compartilhar" do módulo Gestão de Documentos.
    async getGedDocumentsByToken(token: string): Promise<PortalGedDocument[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_ged_documents', { p_token: token });
        if (error) { console.error('[clientPortalService] getGedDocumentsByToken:', error); return []; }
        const res = data as { valid: boolean; data: PortalGedDocument[] | null };
        return res?.valid ? (res.data ?? []) : [];
    },

    // Link assinado para baixar um documento do GED compartilhado — via Edge Function
    // (service_role), porque o bucket 'opura-docs' é privado e o portal é anon.
    async getGedDownloadUrl(token: string, storagePath: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('portal-ged-download', {
            body: { token, storagePath },
        });
        if (error) throw error;
        if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de download.');
        return data.signedUrl as string;
    },

    // Portal por token (anon): lê o realizado das POs de um projeto via RPC
    // SECURITY DEFINER, já que purchase_orders passou a ter RLS. Retorna só
    // { status, items } — o único dado que o cálculo de progresso financeiro
    // do portal consome (calculateRealizedFinancialProgress).
    async getOrdersByToken(token: string, projectId: string): Promise<{ status: string; items: any[] }[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_orders', { p_token: token, p_project_id: projectId });
        if (error) { console.error('[clientPortalService] getOrdersByToken:', error); return []; }
        const res = data as { valid: boolean; data: { status: string; items: any[] }[] | null };
        return res?.valid ? (res.data ?? []) : [];
    },

    async getPlanningByToken(token: string): Promise<PortalPlanning | null> {
        const { data, error } = await supabase.rpc('fn_portal_get_planning', { p_token: token });
        if (error) throw error;
        const res = data as (PortalPlanning & { valid: boolean; found?: boolean });
        if (!res?.valid || res.found === false) return null;
        return res;
    },

    // Caminho autenticado (prévia do admin, sem token público)
    async getPlanningForClient(clientId: string): Promise<PortalPlanning | null> {
        const { data, error } = await supabase.rpc('fn_planning_for_client', { p_client_id: clientId });
        if (error) throw error;
        const res = data as (PortalPlanning & { valid: boolean; found?: boolean });
        if (!res?.valid || res.found === false) return null;
        return res;
    },

    async getTokenForClient(clientId: string): Promise<ClientPortalToken | null> {
        const { data, error } = await supabase
            .from('client_portal_tokens')
            .select('id, org_id, client_id, token, expires_at, last_used_at, is_active, created_at')
            .eq('client_id', clientId)
            .maybeSingle();
        if (error) throw error;
        return data as ClientPortalToken | null;
    },

    async revokeToken(clientId: string): Promise<void> {
        const { error } = await supabase
            .from('client_portal_tokens')
            .update({ is_active: false })
            .eq('client_id', clientId);
        if (error) throw error;
    },

    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-cliente?token=${token}`;
    },
};
