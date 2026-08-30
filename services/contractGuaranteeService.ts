import { supabase } from '../lib/supabase';
import { ContractGuarantee, GuaranteeKind } from '../types/contracts';

export interface ContractGuaranteeExpiring {
    guarantee_id: string;
    contract_id: string;
    contract_title: string;
    kind: GuaranteeKind;
    insurer?: string;
    valid_until: string;
    days_remaining: number;
}

export const contractGuaranteeService = {
    /**
     * Seguros/garantias de OBRA do contrato.
     *
     * Filtra `scope='OBRA'` de propósito: garantia LOCATÍCIA vive na mesma
     * tabela mas é versionada (uma ativa por contrato, art. 43) e tem tela
     * própria em Gerenciar Negociação › Garantias Locatícias. Listá-la aqui
     * exporia um formulário que não conhece `is_active`/`version` e que, ao
     * salvar, corromperia a cadeia de versões.
     */
    list: async (contractId: string): Promise<ContractGuarantee[]> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select('*')
            .eq('contract_id', contractId)
            .eq('scope', 'OBRA')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    save: async (payload: Partial<ContractGuarantee> & { organization_id: string; contract_id: string }): Promise<ContractGuarantee> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_guarantees').update(rest).eq('id', id)
            : supabase.from('contract_guarantees').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_guarantees').delete().eq('id', id);
        if (error) throw error;
    },

    /** Apólices/garantias vigentes vencendo em até N dias — alimenta o KPI do dashboard */
    listExpiring: async (organizationId: string | null, days: number = 30): Promise<ContractGuaranteeExpiring[]> => {
        const { data, error } = await supabase.rpc('fn_contract_guarantees_expiring', {
            p_organization_id: organizationId,
            p_days: days,
        });
        if (error) throw error;
        return data ?? [];
    },

    // ─── GARANTIAS DE DÍVIDA (scope='DIVIDA') ──────────────────────────────
    //
    // Terceira família da mesma tabela, ao lado de OBRA e LOCACAO. Os métodos
    // ficam AQUI, e não num serviço novo, pelo mesmo motivo que os de cima
    // filtram por scope: a tabela é uma só, e separar por serviço faria duas
    // camadas concorrerem pelo mesmo dado. O que separa as famílias é o
    // `scope`, nunca o arquivo.
    //
    // A estrutura veio da migration `aplicar_20270915000002`: `contract_id`
    // passou a nullable, entrou `debt_contract_id` e a constraint
    // `contract_guarantees_dono_unico` garante exatamente um dono.

    listByDebt: async (debtContractId: string): Promise<ContractGuarantee[]> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select('*')
            .eq('debt_contract_id', debtContractId)
            .eq('scope', 'DIVIDA')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    saveForDebt: async (
        payload: Partial<ContractGuarantee> & { organization_id: string; debt_contract_id: string },
    ): Promise<ContractGuarantee> => {
        const { id, ...rest } = payload;
        // `contract_id: null` é obrigatório na criação: sem ele a constraint
        // de dono único barra a linha, porque o default deixaria os dois nulos.
        const linha = { ...rest, scope: 'DIVIDA', contract_id: null };
        const query = id
            ? supabase.from('contract_guarantees').update(linha).eq('id', id)
            : supabase.from('contract_guarantees').insert(linha);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    /**
     * Mesmo bem dado em garantia em mais de uma operação viva (PRD item 8).
     * A view não julga incompatibilidade — mostra o fato para quem decide.
     */
    listAssetConflicts: async (organizationId: string | null): Promise<{
        assetId: string; assetName: string; assetCode: string;
        nOperacoes: number; valorAceitoSomado: number; valorDoBem: number;
    }[]> => {
        let query = supabase
            .from('vw_debt_guarantee_conflicts')
            .select('asset_id, asset_name, asset_code, n_operacoes, valor_aceito_somado, valor_do_bem');
        if (organizationId) query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map(r => ({
            assetId: String(r.asset_id ?? ''),
            assetName: String(r.asset_name ?? ''),
            assetCode: String(r.asset_code ?? ''),
            nOperacoes: Number(r.n_operacoes ?? 0),
            valorAceitoSomado: Number(r.valor_aceito_somado ?? 0),
            valorDoBem: Number(r.valor_do_bem ?? 0),
        }));
    },
};
