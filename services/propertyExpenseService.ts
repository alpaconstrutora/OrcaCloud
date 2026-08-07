import { supabase } from '../lib/supabase';
import {
    allocateDirect,
    allocateProrated,
    allocationsBalance,
    type Allocation,
    type AllocationResult,
    type AllocationTarget,
} from '../lib/rentalAllocation';

/**
 * Apropriação de despesa por imóvel (Fase 2 do plano
 * docs/planos/2026-08-06-kpis-locacao-primitivas.md).
 *
 * ⚠️ As migrations desta fase NÃO sobem no deploy — as 4 partes em
 * `supabase/migrations/aplicar_20270902000000/` são aplicadas à mão. Como na
 * Fase 1, "tabela ainda não existe" é tratado como estado NORMAL: o NOI devolve
 * `null` e a tela não mostra o indicador, em vez de quebrar.
 */

const MISSING_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

const isMissingObject = (error: { code?: string; message?: string } | null): boolean => {
    if (!error) return false;
    if (error.code && MISSING_CODES.has(error.code)) return true;
    const message = (error.message || '').toLowerCase();
    return message.includes('does not exist') || message.includes('schema cache');
};

export const propertyExpenseService = {
    /**
     * Calcula a distribuição SEM gravar — é o que alimenta a prévia na tela.
     * Ver a parcela de cada unidade antes de salvar é o que evita descobrir um
     * rateio errado depois de ele já estar no razão.
     */
    async previewAllocation(
        propertyId: string,
        amount: number,
        mode: 'DIRECT' | 'PRORATED'
    ): Promise<AllocationResult> {
        if (mode === 'DIRECT') return allocateDirect(propertyId, amount);

        const { data, error } = await supabase
            .from('commercial_properties')
            .select('id, private_area, area')
            .eq('parent_id', propertyId);

        if (error) throw error;

        const units = (data || []) as AllocationTarget[];
        // Imóvel sem unidade filha não tem entre quem ratear: a despesa fica
        // nele mesmo, em vez de sumir numa lista vazia.
        if (units.length === 0) return allocateDirect(propertyId, amount);

        return allocateProrated(units, amount);
    },

    /**
     * Grava a apropriação. A RPC revalida a soma no servidor e recusa o que não
     * fecha — a checagem local aqui é só para falhar mais cedo, com mensagem
     * melhor, antes da ida ao banco.
     */
    async saveAllocation(
        transactionId: string,
        amount: number,
        mode: 'DIRECT' | 'PRORATED',
        allocations: Allocation[]
    ): Promise<number> {
        if (allocations.length > 0 && !allocationsBalance(allocations, amount)) {
            throw new Error(
                'Rateio não fecha com o valor do lançamento. Nenhuma alteração foi salva.'
            );
        }

        const { data, error } = await supabase.rpc('fn_set_property_allocations', {
            p_transaction_id: transactionId,
            p_mode: mode,
            p_allocations: allocations,
        });

        if (error) throw error;
        return (data as number) ?? 0;
    },

    /** Apropriações já gravadas de um lançamento. */
    async getAllocations(transactionId: string): Promise<Allocation[]> {
        const { data, error } = await supabase
            .from('property_expense_allocations')
            .select('property_id, amount, basis, basis_value')
            .eq('transaction_id', transactionId);

        if (error) {
            if (isMissingObject(error)) return [];
            throw error;
        }
        return (data || []) as Allocation[];
    },

    /**
     * Despesa apropriada por imóvel no período. Lê SEMPRE de
     * `property_expense_allocations` — nunca de `internal_transactions.property_id`
     * direto — para existir um caminho de leitura só, independente de a despesa
     * ter sido rateada ou não.
     *
     * `null` = não medido (migration não aplicada), diferente de zero.
     */
    async expenseByProperty(
        organizationId?: string | null,
        from?: string,
        to?: string
    ): Promise<Map<string, number> | null> {
        try {
            let query = supabase
                .from('property_expense_allocations')
                .select('property_id, amount, internal_transactions!inner(transaction_date, direction, status)')
                .eq('internal_transactions.direction', 'DEBIT')
                .neq('internal_transactions.status', 'CANCELLED');

            if (organizationId) query = query.eq('organization_id', organizationId);
            if (from) query = query.gte('internal_transactions.transaction_date', from);
            if (to) query = query.lte('internal_transactions.transaction_date', to);

            const { data, error } = await query;

            if (error) {
                // Ver a nota equivalente em rentalVacancyService: 42501 é a RLS
                // barrando, legítimo sem sessão, suspeito com sessão.
                if (error.code === '42501') {
                    console.warn(
                        '[PropertyExpense] Sem permissão para ler a apropriação por imóvel. ' +
                        'Esperado sem sessão autenticada; se você ESTÁ logado, revise a ' +
                        'policy org_access_prop_expense_alloc (parte 2).'
                    );
                    return null;
                }
                if (isMissingObject(error)) {
                    console.info(
                        '[PropertyExpense] Apropriação por imóvel ainda não existe — aplicar ' +
                        'supabase/migrations/aplicar_20270902000000/ (partes 1 a 4). ' +
                        'NOI e derivados ficam ocultos até lá.'
                    );
                    return null;
                }
                throw error;
            }

            const byProperty = new Map<string, number>();
            for (const row of (data || []) as { property_id: string; amount: number }[]) {
                byProperty.set(
                    row.property_id,
                    (byProperty.get(row.property_id) ?? 0) + Number(row.amount || 0)
                );
            }
            return byProperty;
        } catch (err) {
            console.error('[PropertyExpense] Erro ao carregar despesa por imóvel:', err);
            return null;
        }
    },
};
