import { supabase } from '../lib/supabase';
import { Client } from '../types';

// Helper function to map DB snake_case to Frontend camelCase
const mapToFrontendClient = (dbClient: any): Client => {
    return {
        ...dbClient,
        clientDocuments: dbClient.client_documents,
        financialInfo: dbClient.financial_info,
        diaryEntries: dbClient.diary_entries || [],
        scheduleInfo: dbClient.schedule_info || {},
        aiInsight: dbClient.ai_insight || {},
        visualGallery: dbClient.visual_gallery || []
    };
};

// Helper function to map Frontend camelCase to DB snake_case
const mapToDbClient = (client: Partial<Client>): any => {
    const dbClient: any = { ...client };

    if ('clientDocuments' in client) {
        dbClient.client_documents = client.clientDocuments;
        delete dbClient.clientDocuments;
    }
    if ('financialInfo' in client) {
        dbClient.financial_info = client.financialInfo;
        delete dbClient.financialInfo;
    }
    if ('diaryEntries' in client) {
        dbClient.diary_entries = client.diaryEntries;
        delete dbClient.diaryEntries;
    }
    if ('scheduleInfo' in client) {
        dbClient.schedule_info = client.scheduleInfo;
        delete dbClient.scheduleInfo;
    }
    if ('aiInsight' in client) {
        dbClient.ai_insight = client.aiInsight;
        delete dbClient.aiInsight;
    }
    if ('visualGallery' in client) {
        dbClient.visual_gallery = client.visualGallery;
        delete dbClient.visualGallery;
    }

    return dbClient;
};

export const clientService = {
    async listClients(organizationId?: string) {
        // Obter campos. Usamos '*' temporariamente para evitar erro 42703 se organization_id não existir ainda
        let query = supabase
            .from('clients')
            .select('*');
        
        if (organizationId) {
            // Se organizationId for fornecido, tentamos filtrar. 
            // Nota: Se a coluna não existir, o Supabase retornará erro aqui também.
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        let { data, error } = await query.order('name', { ascending: true });
        
        // Se houver erro de coluna inexistente (42703) e estávamos filtrando, tentamos sem o filtro
        if (error && error.code === '42703' && organizationId) {
            console.warn("[CLIENT SERVICE] organization_id column missing, falling back to global list.");
            const retry = await supabase
                .from('clients')
                .select('*')
                .order('name', { ascending: true });
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error("Supabase Error on listClients:", error);
            throw error;
        }
        return (data || []).map(mapToFrontendClient);
    },

    async saveClient(client: Partial<Client>) {
        const payload = mapToDbClient(client);
        const clientId = client.id;

        // Limpar chaves que não devem ser atualizadas pelo body para evitar erros
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;

        if (clientId) {
            const { data, error } = await supabase
                .from('clients')
                .update(payload)
                .eq('id', clientId)
                .select()
                .single();

            if (error) {
                console.error("Supabase Error on update client:", error);
                throw error;
            }
            return mapToFrontendClient(data);
        } else {
            const { data, error } = await supabase
                .from('clients')
                .insert(payload)
                .select()
                .single();

            if (error) {
                console.error("Supabase Error on insert client:", error);
                throw error;
            }
            return mapToFrontendClient(data);
        }
    },

    async deleteClient(id: string) {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async getByEmail(email: string): Promise<Client | null> {
        try {
            console.log('[CLIENT SERVICE] Searching for email:', email);
            console.log('[CLIENT SERVICE] Normalized email:', email.toLowerCase());

            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('email', email.toLowerCase())
                .maybeSingle();

            console.log('[CLIENT SERVICE] Query result - data:', data);
            console.log('[CLIENT SERVICE] Query result - error:', error);

            if (error) throw error;
            return data ? mapToFrontendClient(data) : null;
        } catch (error: any) {
            console.error("[CLIENT SERVICE] Error fetching client by email:", error.message);
            return null;
        }
    },

    async getById(id: string): Promise<Client | null> {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data ? mapToFrontendClient(data) : null;
        } catch (error: any) {
            console.error("[CLIENT SERVICE] Error fetching client by id:", error.message);
            return null;
        }
    }
};
