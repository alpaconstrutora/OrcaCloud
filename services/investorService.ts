import { supabase } from '../lib/supabase';

export interface Investor {
    id: string;
    name: string;
    email: string;
    phone?: string;
    document?: string;
    organization_id?: string;
    created_at?: string;
}

export const investorService = {
    async listInvestors(organizationId?: string) {
        // We'll try to fetch, if it fails because table doesn't exist, we return empty
        try {
            let query = supabase
                .from('investors')
                .select('*');
            
            if (organizationId) {
                // Se organizationId for fornecido, tentamos filtrar. 
                // Nota: Se a coluna não existir, o Supabase retornará erro aqui.
                query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
            }

            let { data, error } = await query.order('name', { ascending: true });

            // Se houver erro de coluna inexistente (42703) e estávamos filtrando, tentamos sem o filtro
            if (error && error.code === '42703' && organizationId) {
                console.warn("[INVESTOR SERVICE] organization_id column missing, falling back to global list.");
                const retry = await supabase
                    .from('investors')
                    .select('*')
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
        if (investor.id) {
            const { data, error } = await supabase
                .from('investors')
                .update(investor)
                .eq('id', investor.id)
                .select()
                .single();

            if (error) throw error;
            return data as Investor;
        } else {
            const { data, error } = await supabase
                .from('investors')
                .insert(investor)
                .select()
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
                .select('*')
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
        const { data, error } = await supabase
            .from('sinapi_items')
            .select('code, price')
            .in('code', codes);

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

        // R-8N is Column 4 (Index 4) based on our debug
        // Rows match standard NBR items
        // We act on rows > 3

        // Manual Map: Description Pattern -> SINAPI Code
        // TODO: This should be moved to a configuration file or DB table
        const NBR_TO_SINAPI: Record<string, string> = {
            "Chapa compensado": "1358", // CHAPA DE MADEIRA COMPENSADA RESINADA 17MM
            "Aço CA-50": "10917", // AÇO CA-50 10MM
            "Concreto": "94964", // CONCRETO FCK=25MPA
            "Cimento": "1379", // CIMENTO PORTLAND
            "Areia": "367", // AREIA MEDIA
            "Brita": "4721", // PEDRA BRITADA N. 2
            "Bloco cerâmico": "7258", // BLOCO CERAMICO 9X19X19
            "Porta interna": "91306", // KIT PORTA DE MADEIRA
            "Esquadria de correr": "40659", // JANELA DE CORRER (Proxy)
            "Fechadura": "91306", // (Reuse Kit Porta as proxy or ignore)
            "Placa de gesso": "96186", // FORRO DE GESSO
            "Vidro liso": "72116", // VIDRO LISO (if 0, acceptable small impact)
            "Tinta látex": "88489", // PINTURA LATEX
            "Emulsão": "98546", // IMPERMEABILIZAÇÃO
            "Fio de cobre": "938", // FIO DE COBRE SOLIDO 2.5MM (Corrected from 101878)
            "Disjuntor": "93654", // DISJUNTOR
            "Bacia sanitária": "6023", // BACIA SANITARIA
            "Registro": "6029", // REGISTRO
            "Tubo de ferro": "92695", // TUBO ACO GALVANIZADO
            "Tubo de PVC": "9868", // TUBO PVC
            "Pedreiro": "88309", // PEDREIRO COM ENCARGOS
            "Servente": "88316", // SERVENTE COM ENCARGOS
            "Engenheiro": "93208", // ENGENHEIRO CIVIL
            "Locação de betoneira": "88830" // BETONEIRA (aluguel)
        };

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
            const { data, error } = await supabase
                .from('sinapi_items')
                .select('*')
                .ilike('description', `%${query}%`)
                .limit(20);

            if (error) throw error;
            return data || [];
        } catch (error: unknown) {
            console.warn("Error searching SINAPI:", error instanceof Error ? error.message : error);
            return [];
        }
    }
};
