import { supabase } from '../lib/supabase';

export interface ClientRequest {
    id: string;
    organization_id: string;
    client_id: string;
    title: string;
    description?: string;
    category: string;
    priority: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
    status: 'Aberto' | 'Em Andamento' | 'Aguardando' | 'Resolvido' | 'Cancelado';
    assigned_to?: string;
    admin_notes?: string;
    photos?: { url: string; name: string }[];
    opened_at: string;
    resolved_at?: string;
    created_at: string;
    updated_at: string;
    /** Unidade do condomínio, quando o chamado é de um condômino. NULO = cliente
     *  de obra. A coluna existe desde a migration do portal do condômino; o que
     *  faltava era a RPC devolvê-la e a tela mostrá-la. */
    unit_id?: string | null;
    unit_name?: string | null;
    tower_name?: string | null;
    condominio_name?: string | null;
}

export interface ClientServiceOrder {
    id: string;
    organization_id: string;
    client_id: string;
    number: string;
    title: string;
    description?: string;
    status: 'Aberta' | 'Em Execução' | 'Concluída' | 'Cancelada';
    priority: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
    scheduled_date?: string;
    completed_date?: string;
    assigned_to?: string;
    contract_id?: string;
    value?: number;
    attachments?: { url: string; name: string }[];
    admin_notes?: string;
    created_at: string;
    updated_at: string;
}

export const clientRequestsService = {
    // ── Admin: lê chamados por org/cliente ────────────────────────────────────
    async listRequests(orgId: string, clientId?: string): Promise<ClientRequest[]> {
        let q = supabase
            .from('client_requests')
            .select('id,organization_id,client_id,title,description,category,priority,status,assigned_to,admin_notes,photos,opened_at,resolved_at,created_at,updated_at')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ClientRequest[];
    },

    async createRequest(orgId: string, clientId: string, payload: Omit<ClientRequest, 'id' | 'organization_id' | 'client_id' | 'created_at' | 'updated_at'>): Promise<ClientRequest> {
        const { data, error } = await supabase
            .from('client_requests')
            .insert({ ...payload, organization_id: orgId, client_id: clientId })
            .select('id,organization_id,client_id,title,description,category,priority,status,assigned_to,admin_notes,photos,opened_at,resolved_at,created_at,updated_at')
            .single();
        if (error) throw error;
        return data as ClientRequest;
    },

    async updateRequest(id: string, payload: Partial<ClientRequest>): Promise<void> {
        const { error } = await supabase.from('client_requests').update(payload).eq('id', id);
        if (error) throw error;
    },

    async deleteRequest(id: string): Promise<void> {
        const { error } = await supabase.from('client_requests').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Admin: lê OS por org/cliente ──────────────────────────────────────────
    async listServiceOrders(orgId: string, clientId?: string): Promise<ClientServiceOrder[]> {
        let q = supabase
            .from('client_service_orders')
            .select('id,organization_id,client_id,number,title,description,status,priority,scheduled_date,completed_date,assigned_to,contract_id,value,attachments,admin_notes,created_at,updated_at')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ClientServiceOrder[];
    },

    async createServiceOrder(orgId: string, clientId: string, payload: Omit<ClientServiceOrder, 'id' | 'organization_id' | 'client_id' | 'created_at' | 'updated_at'>): Promise<ClientServiceOrder> {
        const { data, error } = await supabase
            .from('client_service_orders')
            .insert({ ...payload, organization_id: orgId, client_id: clientId })
            .select('id,organization_id,client_id,number,title,description,status,priority,scheduled_date,completed_date,assigned_to,contract_id,value,attachments,admin_notes,created_at,updated_at')
            .single();
        if (error) throw error;
        return data as ClientServiceOrder;
    },

    async updateServiceOrder(id: string, payload: Partial<ClientServiceOrder>): Promise<void> {
        const { error } = await supabase.from('client_service_orders').update(payload).eq('id', id);
        if (error) throw error;
    },

    async deleteServiceOrder(id: string): Promise<void> {
        const { error } = await supabase.from('client_service_orders').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Portal anon: lê via token ─────────────────────────────────────────────
    async getRequestsByToken(token: string): Promise<ClientRequest[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_requests', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: ClientRequest[] | null };
        return res.valid ? (res.data ?? []) : [];
    },

    async createRequestByToken(token: string, payload: { title: string; description: string; category: string; priority: string; unitId?: string | null }): Promise<void> {
        // `p_unit_id` é opcional na RPC (DEFAULT NULL) e a função valida que a
        // unidade é MESMO deste cliente — o portal não pode virar porta para
        // abrir chamado na sala de outra pessoa.
        const { data, error } = await supabase.rpc('fn_portal_create_request', {
            p_token:       token,
            p_title:       payload.title,
            p_description: payload.description,
            p_category:    payload.category,
            p_priority:    payload.priority,
            p_unit_id:     payload.unitId ?? null,
        });
        if (error) throw error;
        const res = data as { success: boolean; error?: string };
        if (!res.success) throw new Error(res.error ?? 'Erro ao criar chamado');
    },

    async getServiceOrdersByToken(token: string): Promise<ClientServiceOrder[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_service_orders', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: ClientServiceOrder[] | null };
        return res.valid ? (res.data ?? []) : [];
    },
};
