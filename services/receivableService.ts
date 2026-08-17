import { supabase } from '../lib/supabase';
import type { Receivable, ReceivableBusinessStatus, InadimplenciaFaixa } from '../types/financial';

export interface ReceivableFilters {
    search?: string;
    status?: ReceivableBusinessStatus | 'VENCIDO' | 'all';
    dueFrom?: string;
    dueTo?: string;
    projectId?: string;
}

export const receivableService = {

    /** `organizationId` null = "Todas as organizações": sem filtro, a RLS recorta. */
    async list(organizationId: string | null, filters?: ReceivableFilters): Promise<Receivable[]> {
        let q = supabase
            .from('vw_receivables')
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,effective_status,party_id,party_name,party_type,project_id,project_name,cost_center_id,plano_de_contas_id,created_at,updated_at')
            .order('due_date', { ascending: true, nullsFirst: false });

        if (organizationId) q = q.eq('organization_id', organizationId);

        if (filters?.dueFrom)    q = q.gte('due_date', filters.dueFrom);
        if (filters?.dueTo)      q = q.lte('due_date', filters.dueTo);
        if (filters?.projectId)  q = q.eq('project_id', filters.projectId);

        const { data, error } = await q;
        if (error) throw error;

        let rows = (data || []) as Receivable[];

        if (filters?.status && filters.status !== 'all') {
            rows = rows.filter(r => r.effective_status === filters.status);
        }

        if (filters?.search) {
            const q2 = filters.search.toLowerCase();
            rows = rows.filter(r =>
                (r.party_name ?? '').toLowerCase().includes(q2) ||
                (r.description ?? '').toLowerCase().includes(q2) ||
                (r.project_name ?? '').toLowerCase().includes(q2) ||
                (r.reference_id ?? '').toLowerCase().includes(q2),
            );
        }

        return rows;
    },

    async updateStatus(
        id: string,
        newStatus: ReceivableBusinessStatus,
    ): Promise<void> {
        const updates: Record<string, unknown> = {
            business_status: newStatus,
            updated_at: new Date().toISOString(),
        };
        // Sincroniza status de conciliação quando confirmado
        if (newStatus === 'RECEBIDO')       updates.status = 'CONCILIATED';
        else if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';
        else if (newStatus !== 'PARCIAL' && newStatus !== 'RENEGOCIADO') {
            /* Espelho de `payableService.updateStatus`: voltar para estado aberto
               (Previsto/Emitido/Enviado) tem que desfazer a baixa em `status` e
               `payment_date`, senão a view — que desde 20270909000000 lê os dois
               campos — mantém o título como Recebido. */
            updates.status = 'PENDING';
            updates.payment_date = null;
        }

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
            party_id?: string;
            party_name?: string;
            party_type?: string;
            project_id?: string;
            category?: string;
        },
    ): Promise<Receivable> {
        const { data: row, error } = await supabase
            .from('internal_transactions')
            .insert({
                organization_id: organizationId,
                source_system:   'MANUAL',
                direction:       'CREDIT',
                transaction_date: data.due_date,
                due_date:        data.due_date,
                amount:          data.amount,
                description:     data.description,
                party_id:        data.party_id ?? null,
                party_name:      data.party_name ?? null,
                party_type:      data.party_type ?? 'CLIENT',
                project_id:      data.project_id ?? null,
                category:        data.category ?? null,
                status:          'PENDING',
                business_status: 'PREVISTO',
            })
            .select('id,organization_id,source_system,reference_id,transaction_date,due_date,amount,description,category,status,business_status,party_id,party_name,party_type,project_id,created_at,updated_at')
            .single();
        if (error) throw error;
        return { ...row, direction: 'CREDIT', effective_status: 'PREVISTO' } as Receivable;
    },

    /** Corrige dados de negócio do recebível (valor, vencimento, descrição, contraparte). */
    async update(
        id: string,
        data: {
            amount?: number; due_date?: string; description?: string;
            party_id?: string | null; party_name?: string | null; category?: string | null;
        },
    ): Promise<void> {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (data.amount      !== undefined) updates.amount = data.amount;
        if (data.due_date    !== undefined) {
            updates.due_date = data.due_date;
            // transaction_date espelha o vencimento em lançamento manual (é como o
            // create o grava) — sem isso a linha reordena/soma errado após editar.
            updates.transaction_date = data.due_date;
        }
        if (data.description !== undefined) updates.description = data.description;
        if (data.party_id    !== undefined) updates.party_id = data.party_id;
        if (data.party_name  !== undefined) updates.party_name = data.party_name;
        if (data.category    !== undefined) updates.category = data.category;

        const { error } = await supabase
            .from('internal_transactions')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Exclui um recebível **manual**.
     * O `.eq('source_system','MANUAL')` é trava de segurança, não filtro de
     * conveniência: lançamentos vindos de outro módulo (negócio comercial,
     * contrato, NF-e) são espelho da origem — apagados aqui, voltariam no
     * próximo sync e, pior, sumiriam do lugar onde de fato são gerenciados.
     */
    async remove(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('id', id)
            .eq('source_system', 'MANUAL')
            .select('id');

        if (error) {
            // reconciliation_matches tem FK RESTRICT: recebível casado com uma
            // linha do extrato não pode sumir sem desfazer a conciliação antes.
            if (error.code === '23503') {
                throw new Error('Este recebível está conciliado com o extrato bancário. Desfaça a conciliação antes de excluir.');
            }
            throw error;
        }
        if (!data || data.length === 0) {
            throw new Error('Só lançamentos manuais podem ser excluídos aqui. Este veio de outro módulo — exclua na origem.');
        }
    },

    /**
     * Faixas de inadimplência. A RPC `fn_inadimplencia` consolida POR organização,
     * então em "Todas as organizações" (null) não há um número único a devolver —
     * retorna vazio e a tela omite só este KPI. A LISTA de recebíveis continua
     * carregando normalmente (`list` aceita null).
     */
    async getInadimplencia(organizationId: string | null): Promise<InadimplenciaFaixa[]> {
        if (!organizationId) return [];
        const { data, error } = await supabase.rpc('fn_inadimplencia', {
            p_organization_id: organizationId,
        });
        if (error) throw error;
        return (data || []) as InadimplenciaFaixa[];
    },
};
