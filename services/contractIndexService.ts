import { supabase } from '../lib/supabase';

export type IndexName = 'INCC' | 'INCC-M' | 'IPCA' | 'IGP-M' | 'CUB' | 'OUTROS';

export interface ContractIndexValue {
    id: string;
    organization_id: string | null;
    index_name: IndexName;
    reference_month: string;  // 'YYYY-MM-DD' (sempre dia 01)
    value: number;
    source?: string;
    created_at: string;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-\d{2}$/, '-01');

const INDEX_NAMES: IndexName[] = ['INCC', 'INCC-M', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

/**
 * Normaliza o nome do índice para o vocabulário de `contract_index_values`.
 * Necessário porque contratos antigos foram gravados com 'IGPM'/'INCCM' (sem
 * hífen) e `getClosestTo` faz match exato — o reajuste automático nunca
 * encontrava a série e a fila acusava "índice não encontrado".
 */
export function normalizeIndexName(raw?: string | null): IndexName | undefined {
    if (!raw) return undefined;
    const up = raw.trim().toUpperCase().replace(/[\s.]/g, '');
    const direct = INDEX_NAMES.find(n => n.replace('-', '') === up.replace('-', ''));
    return direct ?? (INDEX_NAMES.includes(up as IndexName) ? (up as IndexName) : 'OUTROS');
}

export const contractIndexService = {
    /** Lista os N meses mais recentes de um índice (org ou global) */
    list: async (
        indexName: IndexName,
        organizationId?: string,
        months: number = 24
    ): Promise<ContractIndexValue[]> => {
        let q = supabase
            .from('contract_index_values')
            .select('id, organization_id, index_name, reference_month, value, source, created_at')
            .eq('index_name', indexName)
            .order('reference_month', { ascending: false })
            .limit(months);

        if (organizationId) {
            q = q.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
        } else {
            q = q.is('organization_id', null);
        }

        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    /** Valor mais recente disponível até uma data */
    getClosestTo: async (
        indexName: IndexName,
        referenceDate: string,
        organizationId?: string
    ): Promise<ContractIndexValue | null> => {
        const monthStart = referenceDate.slice(0, 7) + '-01';
        let q = supabase
            .from('contract_index_values')
            .select('id, organization_id, index_name, reference_month, value, source, created_at')
            .eq('index_name', indexName)
            .lte('reference_month', monthStart)
            .order('reference_month', { ascending: false })
            .limit(1);

        if (organizationId) {
            q = q.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
        } else {
            q = q.is('organization_id', null);
        }

        const { data, error } = await q;
        if (error) throw error;
        return data?.[0] ?? null;
    },

    /** Insere ou atualiza um valor de índice */
    upsert: async (
        organizationId: string,
        indexName: IndexName,
        referenceMonth: Date,
        value: number,
        source?: string
    ): Promise<ContractIndexValue> => {
        const monthStr = fmt(referenceMonth);
        const { data, error } = await supabase
            .from('contract_index_values')
            .upsert({
                organization_id: organizationId,
                index_name: indexName,
                reference_month: monthStr,
                value,
                source: source ?? 'Manual',
            }, { onConflict: 'organization_id,index_name,reference_month' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('contract_index_values')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    /** Verifica contratos com reajuste_proximo <= hoje e retorna lista */
    listDueForReajuste: async (organizationId: string | null): Promise<{
        id: string; number: string; title: string; reajuste_index: string;
        reajuste_proximo: string; current_value: number;
    }[]> => {
        const today = new Date().toISOString().slice(0, 10);
        let q = supabase
            .from('contracts')
            .select('id, number, title, reajuste_index, reajuste_proximo, current_value')
            .eq('status', 'Ativo')
            .not('reajuste_index', 'is', null)
            .not('reajuste_proximo', 'is', null)
            .lte('reajuste_proximo', today);
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },
};
