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
    /** Não existe na tabela `communications` — mantido opcional só por
     *  compatibilidade de tipo. Nenhum select pede: pedir dava 400 (42703). */
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
    async getCommunications(orgId: string | null): Promise<Communication[]> {
        let q = supabase
            .from('communications')
            .select('id, org_id, titulo, conteudo, tipo, scope, scope_ids, canal_app, canal_whatsapp, agendado_para, enviado_em, status, dds_tema, dds_duracao_min, dds_assinaturas_required, anexos, created_by, created_at, updated_at')
            .order('created_at', { ascending: false });
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    },

    // `vw_communication_read_rate` é uma view de TAXAS, não a lista de comunicados:
    // ela só tem id, org_id, titulo, tipo, enviado_em e os quatro campos de leitura.
    // Pedir `conteudo`/`status`/`scope`/`canal_*` dela devolvia 400 (42703 column
    // does not exist) e a tela ficava sem lista. A lista vem da tabela base; a view
    // entra só para acrescentar as taxas, casada por id.
    async getCommunicationReadRates(orgId: string | null): Promise<Communication[]> {
        let base = supabase
            .from('communications')
            .select('id, org_id, titulo, conteudo, tipo, scope, scope_ids, canal_app, canal_whatsapp, agendado_para, enviado_em, status, dds_tema, dds_duracao_min, dds_assinaturas_required, anexos, created_by, created_at, updated_at')
            .order('enviado_em', { ascending: false, nullsFirst: false });
        let taxas = supabase
            .from('vw_communication_read_rate')
            .select('id, total_destinatarios, total_lidos, total_assinados, taxa_leitura_pct');
        if (orgId && orgId !== 'all') {
            base = base.eq('org_id', orgId);
            taxas = taxas.eq('org_id', orgId);
        }

        const [{ data: comms, error: errBase }, { data: rates, error: errTaxas }] =
            await Promise.all([base, taxas]);
        if (errBase) throw errBase;
        // A view é acessória: sem ela a tela ainda lista, só sem percentual.
        if (errTaxas) console.error('[communicationService] taxas de leitura:', errTaxas);

        type Taxa = { id: string; total_destinatarios?: number; total_lidos?: number; total_assinados?: number; taxa_leitura_pct?: number };
        const porId = new Map((rates || []).map((r: Taxa) => [r.id, r]));
        return (comms || []).map(c => ({ ...c, ...(porId.get(c.id) ?? {}) })) as Communication[];
    },

    // Registro COMPLETO por id — usado pelo formulário de edição. O form reenvia
    // os campos que edita (inclusive booleanos e arrays com default), então montá-lo
    // sobre o objeto da listagem o acopla ao select de getCommunications: estreitar
    // aquele select passaria a gravar `false`/`[]` por cima de dado real. Carregando
    // por id com select('*') o formulário fica imune a essa mudança.
    async getCommunication(id: string): Promise<Communication> {
        const { data, error } = await supabase
            .from('communications')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Communication;
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
    async getWhatsappConfig(orgId: string | null): Promise<WhatsappConfig | null> {
        // Config é um registro por organização: em "Todas" não há um único a devolver.
        if (!orgId || orgId === 'all') return null;
        const { data, error } = await supabase
            .from('whatsapp_config')
            .select('id, org_id, provider, api_url, api_key_ref, instance_name, numero_remetente, ativo, webhook_url, created_at, updated_at')
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
    async getWhatsappQueue(orgId: string | null, limit = 50): Promise<any[]> {
        let q = supabase
            .from('whatsapp_queue')
            .select('*, employee:employees(id, name)')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (orgId && orgId !== 'all') q = q.eq('org_id', orgId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map((r: any) => ({ ...r, employee_nome: r.employee?.name }));
    },
};
