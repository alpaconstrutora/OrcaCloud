import { supabase } from '../lib/supabase';
import { sinapiService } from './sinapiService';

// Mapeamento NBR 12721 (padrão R8N, Tabela 5) → códigos SINAPI
// Atualizar conforme novas versões da tabela NBR ou revisões SINAPI.
const NBR_TO_SINAPI: Record<string, string> = {
    "Chapa compensado": "1358",
    "Aço CA-50": "10917",
    "Concreto": "94964",
    "Cimento": "1379",
    "Areia": "367",
    "Brita": "4721",
    "Bloco cerâmico": "7258",
    "Porta interna": "91306",
    "Esquadria de correr": "40659",
    "Fechadura": "91306",
    "Placa de gesso": "96186",
    "Vidro liso": "72116",
    "Tinta látex": "88489",
    "Emulsão": "98546",
    "Fio de cobre": "938",
    "Disjuntor": "93654",
    "Bacia sanitária": "6023",
    "Registro": "6029",
    "Tubo de ferro": "92695",
    "Tubo de PVC": "9868",
    "Pedreiro": "88309",
    "Servente": "88316",
    "Engenheiro": "93208",
    "Locação de betoneira": "88830",
};

export interface Investor {
    id: string;
    name: string;
    email: string;
    phone?: string;
    document?: string;
    organization_id?: string;
    settings?: {
        investorPortalTabs?: string[];
        [key: string]: any;
    };
    created_at?: string;
}

export const investorService = {
    async listInvestors(organizationId?: string) {
        // We'll try to fetch, if it fails because table doesn't exist, we return empty
        try {
            const INVESTOR_COLS = 'id, name, email, phone, document, organization_id, settings, created_at';

            let query = supabase
                .from('investors')
                .select(INVESTOR_COLS);

            if (organizationId) {
                query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
            }

            let { data, error } = await query.order('name', { ascending: true });

            if (error && error.code === '42703' && organizationId) {
                console.warn("[INVESTOR SERVICE] organization_id column missing, falling back to global list.");
                const retry = await supabase
                    .from('investors')
                    .select(INVESTOR_COLS)
                    .order('name', { ascending: true });
                data = retry.data;
                error = retry.error;
            }

            if (error) throw error;
            return data as Investor[];
        } catch (error: unknown) {
            console.warn("Could not list investors:", error instanceof Error ? error.message : error);
            return [];
        }
    },

    async saveInvestor(investor: Partial<Investor>) {
        const INVESTOR_COLS = 'id, name, email, phone, document, organization_id, settings, created_at';
        if (investor.id) {
            // Strip immutable fields from update payload
            const { id, created_at, ...updatePayload } = investor;
            const { data, error } = await supabase
                .from('investors')
                .update(updatePayload)
                .eq('id', id)
                .select(INVESTOR_COLS)
                .single();

            if (error) throw error;
            return data as Investor;
        } else {
            const { data, error } = await supabase
                .from('investors')
                .insert(investor)
                .select(INVESTOR_COLS)
                .single();

            if (error) throw error;
            return data as Investor;
        }
    },

    async deleteInvestor(id: string) {
        const { error } = await supabase
            .from('investors')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async getByEmail(email: string): Promise<Investor | null> {
        try {
            const { data, error } = await supabase
                .from('investors')
                .select('id, name, email, phone, document, organization_id, settings, created_at')
                .eq('email', email.toLowerCase())
                .maybeSingle();

            if (error) throw error;
            return data as Investor;
        } catch (error: unknown) {
            console.error("Error fetching investor by email:", error instanceof Error ? error.message : error);
            return null;
        }
    },

    async getNBRTable(tableName: string) {
        const { data, error } = await supabase
            .from('nbr_tables')
            .select('data')
            .eq('table_name', tableName)
            .single();

        if (error) {
            console.error('Error fetching NBR table:', error);
            return null;
        }

        return data?.data;
    },

    async getSINAPIPrices(codes: string[]) {
        if (!codes.length) return {};
        // Escopa à competência mais recente — sem isso, .in('code') retornaria
        // múltiplas linhas por código quando houver mais de uma competência.
        const ref = await sinapiService.getLatestReferenceDate();
        let q = supabase.from('sinapi_items').select('code, price').in('code', codes);
        if (ref) q = q.eq('reference_date', ref);
        const { data, error } = await q;

        if (error) {
            console.error('Error fetching SINAPI prices:', error);
            return {};
        }

        const prices: Record<string, number> = {};
        data?.forEach((item: { code: string; price: number }) => {
            prices[item.code] = item.price;
        });
        return prices;
    },

    async calculateCUB() {
        // 1. Get NBR Quantities (Table 5 - R8N)
        const nbrData = await this.getNBRTable('TABELA 5');
        if (!nbrData) return 0;

        let totalCUB = 0;
        const codesToFetch = new Set<string>();
        const itemsToProcess: { qty: number, code: string }[] = [];

        nbrData.forEach((row: unknown[], i: number) => {
            if (i < 4 || !row[0]) return;
            const desc = String(row[0] ?? '');
            const qty = Number(row[4]) || 0; // R-8N Column

            // Simple pattern match
            const match = Object.keys(NBR_TO_SINAPI).find(key => desc.includes(key));
            if (match && qty) {
                const code = NBR_TO_SINAPI[match];
                codesToFetch.add(code);
                itemsToProcess.push({ qty, code });
            }
        });

        const prices = await this.getSINAPIPrices(Array.from(codesToFetch));

        itemsToProcess.forEach(item => {
            const price = prices[item.code] || 0;
            totalCUB += item.qty * price;
        });

        return totalCUB;
    },

    async searchSINAPI(query: string) {
        try {
            // `id` NÃO existe em sinapi_items (causava 42703 → busca sempre vazia).
            // Escopa à competência mais recente para não duplicar entre versões.
            const ref = await sinapiService.getLatestReferenceDate();
            let q = supabase
                .from('sinapi_items')
                .select('code, description, price, unit')
                .ilike('description', `%${query}%`)
                .limit(20);
            if (ref) q = q.eq('reference_date', ref);
            const { data, error } = await q;

            if (error) throw error;
            return data || [];
        } catch (error: unknown) {
            console.warn("Error searching SINAPI:", error instanceof Error ? error.message : error);
            return [];
        }
    }
};
