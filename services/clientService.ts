import { supabase } from '../lib/supabase';
import { Client } from '../types';
import { assertDocumentNotDuplicated } from './documentDuplicateCheck';

type DbClientRow = Record<string, unknown>;

// Helper function to map DB snake_case to Frontend camelCase
const mapToFrontendClient = (dbClient: DbClientRow): Client => {
    return {
        ...dbClient,
        clientDocuments: dbClient.client_documents as Client['clientDocuments'],
        financialInfo: dbClient.financial_info as Client['financialInfo'],
        diaryEntries: (dbClient.diary_entries || []) as Client['diaryEntries'],
        scheduleInfo: (dbClient.schedule_info || {}) as Client['scheduleInfo'],
        aiInsight: (dbClient.ai_insight || {}) as Client['aiInsight'],
        visualGallery: (dbClient.visual_gallery || []) as Client['visualGallery'],
        portalTabs: (dbClient.portal_tabs || undefined) as Client['portalTabs'],
    } as Client;
};

// Helper function to map Frontend camelCase to DB snake_case
const mapToDbClient = (client: Partial<Client>): DbClientRow => {
    const dbClient: DbClientRow = { ...client };

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
    if ('portalTabs' in client) {
        dbClient.portal_tabs = client.portalTabs;
        delete dbClient.portalTabs;
    }
    // Remove computed/join fields that don't exist as DB columns
    delete dbClient.organization_name;
    delete dbClient.organizations;

    return dbClient;
};

export const clientService = {
    async listClients(organizationId?: string) {
        // Degraus do mais completo ao mais enxuto: cada `42703` (coluna
        // inexistente) cai para o próximo. Uma LISTA, e não uma cascata de
        // `if`s encadeados, porque a cascata tinha um defeito estrutural: os
        // três degraus antigos pediam `status`, e o único que não pedia estava
        // atrás de `if (organizationId)`. Com o topo em "Todas as organizações"
        // e a migration 20270906000000 pendente, nenhum degrau resolvia — o
        // erro chegava ao `throw` e derrubava a tela inteira de quem chama.
        //
        // Regra ao acrescentar coluna nova: ela entra APENAS no primeiro
        // degrau, e ganha um degrau novo logo abaixo, sem ela.
        const BASE = 'id, code, name, email, phone, document, rg, rg_uf, rg_issuing_agency';
        const COMUM = 'type, category, portal, portal_tabs, address, address_number, neighborhood, zip_code, city, state, created_at, organization_id, organizations:organization_id(name)';
        const QUALIFICACAO = 'nationality, profession, marital_status, marital_regime, spouse_name, spouse_document';
        const REPRESENTANTE = 'legal_rep_name, legal_rep_document, legal_rep_rg, legal_rep_rg_uf, legal_rep_rg_issuing_agency, legal_rep_nationality, legal_rep_role';

        const DEGRAUS: { cols: string; aviso?: string }[] = [
            { cols: `${BASE}, ${QUALIFICACAO}, ${REPRESENTANTE}, status, is_shared, ${COMUM}` },
            {
                // Degrau novo (regra acima): igual ao de cima, sem `is_shared`.
                cols: `${BASE}, ${QUALIFICACAO}, ${REPRESENTANTE}, status, ${COMUM}`,
                aviso: 'Coluna is_shared ausente — aplique a migration aplicar_20270914000018. Cliente compartilhado aparece como da organização dona até lá.',
            },
            {
                cols: `${BASE}, ${QUALIFICACAO}, status, ${COMUM}`,
                aviso: 'Colunas de representante legal ausentes — aplique a migration 20270867000000.',
            },
            {
                cols: `${BASE}, status, ${COMUM}`,
                aviso: 'Colunas de qualificação civil ausentes — aplique a migration 20270842000000.',
            },
            {
                cols: `${BASE}, ${COMUM}`,
                aviso: 'Coluna status ausente — aplique a migration 20270906000000. Os clientes aparecem sem o status até lá.',
            },
            {
                // Último recurso: sem `organization_id` nem o join. Diferente
                // dos anteriores, roda SEMPRE — antes só rodava com uma
                // organização selecionada, e era justamente em "Todas" que a
                // tela quebrava.
                cols: 'id, code, name, email, phone, document, rg, rg_uf, rg_issuing_agency, type, category, address, neighborhood, city, state, created_at',
                aviso: 'Coluna organization_id ausente — listando globalmente.',
            },
        ];

        let data: any[] | null = null;
        let error: { code?: string; message?: string } | null = null;

        for (const [i, degrau] of DEGRAUS.entries()) {
            let query = supabase.from('clients').select(degrau.cols);
            // O último degrau não tem `organization_id`, então não dá para
            // filtrar por ela.
            if (organizationId && degrau.cols.includes('organization_id')) {
                // "Minha organização OU compartilhado" — ver o plano de 2026-08-28.
                query = query.or(`organization_id.eq.${organizationId},is_shared.is.true`);
            }
            const resultado = await query.order('name', { ascending: true });
            data = resultado.data;
            error = resultado.error;
            if (!error) break;
            if (error.code !== '42703') break;   // outro erro não é degrau, é falha
            const proximo = DEGRAUS[i + 1];
            if (proximo?.aviso) console.warn(`[CLIENT SERVICE] ${proximo.aviso}`);
        }

        if (error) {
            console.error("Supabase Error on listClients:", error);
            throw error;
        }

        return (data || []).map((row: any) => ({
            ...mapToFrontendClient(row),
            organization_name: row.organization_id
                ? (row.organizations?.name || null)
                : 'Todas as Organizações'
        }));
    },

    async saveClient(client: Partial<Client>) {
        const payload = mapToDbClient(client);
        const clientId = client.id;

        // Limpar chaves que não devem ser atualizadas pelo body para evitar erros
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;

        if (clientId) {
            if (payload.document !== undefined) {
                await assertDocumentNotDuplicated('client', payload.document as string, clientId);
            }

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
            await assertDocumentNotDuplicated('client', payload.document as string);

            // Código sequencial 001/002/003... único por organização (§ui_ux_guia_unificado.md).
            if (!payload.code) {
                const { data: nextCode } = await supabase.rpc('get_next_client_code', { p_org_id: (client.organization_id as string) ?? null });
                if (nextCode) payload.code = nextCode;
            }
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
        } catch (error: unknown) {
            console.error("[CLIENT SERVICE] Error fetching client by email:", error instanceof Error ? error.message : error);
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
        } catch (error: unknown) {
            console.error("[CLIENT SERVICE] Error fetching client by id:", error instanceof Error ? error.message : error);
            return null;
        }
    }
};
