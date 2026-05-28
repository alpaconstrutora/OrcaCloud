import { supabase } from '../lib/supabase';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type CommTipo = 'AVISO' | 'DDS' | 'TREINAMENTO' | 'URGENTE' | 'ANIVERSARIO';
export type CommScope = 'TODOS' | 'OBRA' | 'DEPARTAMENTO' | 'INDIVIDUAL';
export type CommStatus = 'RASCUNHO' | 'AGENDADO' | 'ENVIADO' | 'CANCELADO';
export type WppStatus = 'PENDENTE' | 'ENVIADO' | 'ENTREGUE' | 'LIDO' | 'FALHOU';
export type WppProvider = 'EVOLUTION' | 'TWILIO' | 'DIALOG360' | 'WPPCONNECT';

export interface Anexo {
    nome: string;
    url: string;
    tipo: string; // mime type
}

export interface Communication {
    id: string;
    org_id: string;
    titulo: string;
    conteudo: string;
    tipo: CommTipo;
    scope: CommScope;
    scope_ids: string[];
    canal_app: boolean;
    canal_whatsapp: boolean;
    agendado_para?: string;
    enviado_em?: string;
    status: CommStatus;
    dds_tema?: string;
    dds_duracao_min?: number;
    dds_assinaturas_required: boolean;
    anexos: Anexo[];
    created_by?: string;
    created_by_nome?: string;
    created_at?: string;
    updated_at?: string;
    // computed from view
    total_destinatarios?: number;
    total_lidos?: number;
    total_assinados?: number;
    taxa_leitura_pct?: number;
}

export interface CommReceipt {
    id: string;
    communication_id: string;
    employee_id: string;
    employee_nome?: string;
    lido_em?: string;
    assinado_em?: string;
    whatsapp_status?: WppStatus;
    whatsapp_sent_at?: string;
}

export interface WhatsappConfig {
    id?: string;
    org_id: string;
    provider: WppProvider;
    api_url?: string;
    api_key_ref?: string;
    instance_name?: string;
    numero_remetente?: string;
    ativo: boolean;
    webhook_url?: string;
    created_at?: string;
    updated_at?: string;
}

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const communicationService = {

    // COMUNICADOS
    async getCommunications(orgId: string): Promise<Communication[]> {
        const { data, error } = await supabase
            .from('communications')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getCommunicationReadRates(orgId: string): Promise<Communication[]> {
        const { data, error } = await supabase
            .from('vw_communication_read_rate')
            .select('*')
            .eq('org_id', orgId)
            .order('enviado_em', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createCommunication(comm: Omit<Communication, 'id' | 'created_at' | 'updated_at'>): Promise<Communication> {
        const { data, error } = await supabase
            .from('communications')
            .insert(comm)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateCommunication(id: string, patch: Partial<Communication>): Promise<void> {
        const { error } = await supabase
            .from('communications')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteCommunication(id: string): Promise<void> {
        const { error } = await supabase.from('communications').delete().eq('id', id);
        if (error) throw error;
    },

    // DISPARAR (RPC)
    async dispatch(commId: string): Promise<{ destinatarios: number; wpp_enfileirados: number }> {
        const { data, error } = await supabase.rpc('dispatch_communication', { p_comm_id: commId });
        if (error) throw error;
        return data;
    },

    // RECIBOS
    async getReceipts(commId: string): Promise<CommReceipt[]> {
        const { data, error } = await supabase
            .from('communication_receipts')
            .select('*, employee:employees(id, name)')
            .eq('communication_id', commId)
            .order('lido_em', { ascending: false, nullsFirst: false });
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, employee_nome: r.employee?.name }));
    },

    async markAsRead(commId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('communication_receipts')
            .update({ lido_em: new Date().toISOString() })
            .eq('communication_id', commId)
            .eq('employee_id', employeeId)
            .is('lido_em', null);
        if (error) throw error;
    },

    async signDds(commId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('communication_receipts')
            .update({
                assinado_em: new Date().toISOString(),
                lido_em: new Date().toISOString(),
            })
            .eq('communication_id', commId)
            .eq('employee_id', employeeId);
        if (error) throw error;
    },

    // WHATSAPP CONFIG
    async getWhatsappConfig(orgId: string): Promise<WhatsappConfig | null> {
        const { data, error } = await supabase
            .from('whatsapp_config')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async upsertWhatsappConfig(config: WhatsappConfig): Promise<void> {
        const { error } = await supabase
            .from('whatsapp_config')
            .upsert({ ...config, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
        if (error) throw error;
    },

    // FILA WHATSAPP
    async getWhatsappQueue(orgId: string, limit = 50): Promise<any[]> {
        const { data, error } = await supabase
            .from('whatsapp_queue')
            .select('*, employee:employees(id, name)')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, employee_nome: r.employee?.name }));
    },
};
