import { supabase } from '../lib/supabase';
import type { Payable, PayableBusinessStatus } from '../types/financial';
import { propertyExpenseService } from './propertyExpenseService';

export interface PayableFilters {
    search?: string;
    status?: PayableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
    projectId?: string;
    /** Origem do título: PURCHASE_ORDER, CONTRACT_PARCELADO, MANUAL… */
    sourceSystem?: string;
}

/** Contraparte exibível: alguns produtores gravam só entity_name. */
export function payableParty(p: Payable): string {
    return p.party_name || p.entity_name || '—';
}

export const payableService = {

    /**
     * `organizationId` aceita null: com "Todas as organizações" selecionado não
     * filtramos por org e deixamos a RLS de internal_transactions recortar o que
     * o usuário pode ver (REGRA #5 do CLAUDE.md — leitura nunca bloqueia).
     */
    async list(organizationId?: string | null, filters?: PayableFilters): Promise<Payable[]> {
        let q = supabase
            .from('vw_payables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,direction,description,category,status,business_status,effective_status,party_id,party_name,party_type,entity_name,project_id,project_name,cost_center_id,plano_de_contas_id,created_at,updated_at')
            .order('due_date', { ascending: true, nullsFirst: false });

        if (organizationId)      q = q.eq('organization_id', organizationId);
        if (filters?.dueFrom)    q = q.gte('due_date', filters.dueFrom);
        if (filters?.dueTo)      q = q.lte('due_date', filters.dueTo);
        if (filters?.projectId)  q = q.eq('project_id', filters.projectId);
        if (filters?.sourceSystem) q = q.eq('source_system', filters.sourceSystem);

        const { data, error } = await q;
        if (error) throw error;

        let rows = (data || []) as Payable[];

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        if (filters?.search) {
            const termo = filters.search.toLowerCase();
            rows = rows.filter(r =>
                payableParty(r).toLowerCase().includes(termo) ||
                (r.description ?? '').toLowerCase().includes(termo) ||
                (r.project_name ?? '').toLowerCase().includes(termo) ||
                (r.reference_id ?? '').toLowerCase().includes(termo),
            );
        }

        return rows;
    },

    async updateStatus(id: string, newStatus: PayableBusinessStatus): Promise<void> {
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        if (newStatus === 'PAGO')      updates.status = 'CONCILIATED';
        if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    async create(
        organizationId: string,
        data: {
            due_date: string;
            amount: number;
            description: string;
            party_name?: string;
            project_id?: string;
            category?: string;
            /** Imóvel ao qual a despesa pertence (Fase 2 — OPEX por imóvel). */
            property_id?: string | null;
            /** DIRECT = fica no imóvel; PRORATED = rateia entre as unidades filhas. */
            property_allocation_mode?: 'DIRECT' | 'PRORATED';
        },
    ): Promise<Payable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   'MANUAL',
                direction:       'DEBIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                // party_id fica de fora: FK só para `clients`, e aqui a
                // contraparte é fornecedor (internal_txs_party_id_fkey).
                party_name:      data.party_name ?? null,
                entity_name:     data.party_name ?? null,
                party_type:      'SUPPLIER',
                project_id:      data.project_id ?? null,
                category:        data.category ?? null,
                property_id:     data.property_id ?? null,
                property_allocation_mode: data.property_allocation_mode ?? 'DIRECT',
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,party_id,party_name,party_type,entity_name,project_id,created_at,updated_at')
            .single();
        if (error) throw error;

        // Materializa a apropriação por imóvel. Depois do insert, e não numa
        // transação com ele, porque o PostgREST não expõe transação multi-passo:
        // se esta parte falhar, o lançamento existe sem apropriação — estado
        // recuperável (reabrir e salvar de novo), ao contrário do inverso, que
        // seria apropriação órfã de lançamento.
        if (data.property_id) {
            try {
                const mode = data.property_allocation_mode ?? 'DIRECT';
                const preview = await propertyExpenseService.previewAllocation(
                    data.property_id, data.amount, mode,
                );
                await propertyExpenseService.saveAllocation(
                    row.id as string, data.amount, mode, preview.allocations,
                );
            } catch (allocError) {
                // Não derruba a criação da conta a pagar: o lançamento é o dado
                // principal, a apropriação é dimensão analítica. Mas precisa
                // aparecer, senão o NOI fica com buraco silencioso.
                console.error(
                    '[Payable] Conta criada, mas a apropriação por imóvel falhou. ' +
                    'O NOI não contará esta despesa até ser reaplicada:', allocError,
                );
            }
        }

        return { ...row, direction: 'DEBIT', effective_status: 'PREVISTO' } as Payable;
    },

    /** Corrige dados de negócio do título (valor, vencimento, descrição, contraparte). */
    async update(
        id: string,
        data: {
            amount?: number; due_date?: string; description?: string;
            party_name?: string | null; category?: string | null;
        },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            // transaction_date espelha o vencimento em lançamento manual (é como
            // o create grava) — sem isso a linha reordena/soma errado após editar.
            updates.transaction_date = data.due_date;
        }
        if (data.description !== undefined) updates.description = data.description;
        if (data.party_name  !== undefined) {
            updates.party_name = data.party_name;
            updates.entity_name = data.party_name;
        }
        if (data.category    !== undefined) updates.category = data.category;

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Exclui um título **manual**.
     * O `.eq('source_system','MANUAL')` é trava de segurança, não filtro de
     * conveniência: parcela vinda de Pedido ou Contrato é espelho da origem —
     * apagada aqui, voltaria no próximo sync e, pior, sumiria do lugar onde de
     * fato é gerenciada.
     */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('id', id)
            .eq('source_system', 'MANUAL')
            .select('id');

        if (error) {
            // reconciliation_matches tem FK RESTRICT: título casado com uma linha
            // do extrato não pode sumir sem desfazer a conciliação antes.
            if (error.code === '23503') {
                throw new Error('Este título está conciliado com o extrato bancário. Desfaça a conciliação antes de excluir.');
            }
            throw error;
        }
        if (!data || data.length === 0) {
            throw new Error('Só lançamentos manuais podem ser excluídos aqui. Este veio de Pedidos ou Contratos — exclua na origem.');
        }
    },
};
