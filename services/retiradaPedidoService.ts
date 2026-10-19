import { supabase } from '../lib/supabase';
import { laborService } from './laborService';

/**
 * Retirada de pedido FOB: colaboradores (RH › Colaboradores) autorizados a
 * retirar — vários por pedido — e quem de fato retirou.
 *
 * Banco: aplicar_20271019987000_pedido_fob_retirada_autorizada.
 *  · `purchase_order_retirada_autorizados` — RLS = enxergar o pedido (comprador).
 *  · `purchase_orders.retirado_por_employee_id` — gravado por `updateOrder`
 *    junto com o status 'Entregue' (= "Retirado").
 *  · O fornecedor NÃO lê nada disso direto: recebe só nome e CPF dos
 *    autorizados pela RPC `purchase_order_retirada_autorizados_fornecedor`.
 */

export interface ColaboradorRetirada {
    id: string;
    nome: string;
    cpf?: string;
    matricula?: string;
    cargo?: string;
}

export interface RetiradaDoPedido {
    /** Organização do pedido — de onde vêm os colaboradores do seletor. */
    organizationId: string | null;
    autorizados: ColaboradorRetirada[];
    retiradoPor: ColaboradorRetirada | null;
}

/** O que o fornecedor vê de cada autorizado (conferência no balcão). */
export interface AutorizadoParaFornecedor {
    nome: string;
    cpf?: string;
}

type EmpRow = { id: string; name: string; cpf?: string | null; matricula?: string | null; role?: string | null };

const doRow = (e: EmpRow): ColaboradorRetirada => ({
    id: e.id,
    nome: e.name,
    cpf: e.cpf || undefined,
    matricula: e.matricula || undefined,
    cargo: e.role || undefined,
});

export const retiradaPedidoService = {
    async get(orderId: string): Promise<RetiradaDoPedido> {
        const [pedido, autorizados] = await Promise.all([
            supabase
                .from('purchase_orders')
                .select('organization_id, retirado_por:employees!retirado_por_employee_id(id, name, cpf, matricula, role)')
                .eq('id', orderId)
                .maybeSingle(),
            supabase
                .from('purchase_order_retirada_autorizados')
                .select('employee:employees!employee_id(id, name, cpf, matricula, role)')
                .eq('purchase_order_id', orderId),
        ]);
        if (pedido.error) throw pedido.error;
        if (autorizados.error) throw autorizados.error;

        const p = pedido.data as { organization_id?: string | null; retirado_por?: EmpRow | null } | null;
        const lista = ((autorizados.data ?? []) as unknown as { employee: EmpRow | null }[])
            .map(a => a.employee)
            .filter((e): e is EmpRow => !!e)
            .map(doRow)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return {
            organizationId: p?.organization_id ?? null,
            autorizados: lista,
            retiradoPor: p?.retirado_por ? doRow(p.retirado_por) : null,
        };
    },

    async adicionarAutorizado(orderId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('purchase_order_retirada_autorizados')
            .insert({ purchase_order_id: orderId, employee_id: employeeId });
        // 23505 = já estava autorizado; não é erro para quem clicou.
        if (error && error.code !== '23505') throw error;
    },

    async removerAutorizado(orderId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('purchase_order_retirada_autorizados')
            .delete()
            .eq('purchase_order_id', orderId)
            .eq('employee_id', employeeId);
        if (error) throw error;
    },

    /**
     * Colaboradores ATIVOS da organização do pedido (+ os compartilhados com
     * ela — mesma regra de RH › Colaboradores). Sem organização, a RLS recorta.
     */
    async listarColaboradores(organizationId: string | null): Promise<ColaboradorRetirada[]> {
        const todos = await laborService.listEmployees(organizationId);
        return (todos as unknown as (EmpRow & { status?: string | null })[])
            .filter(e => !e.status || e.status === 'ATIVO')
            .map(doRow);
    },

    /** Visão do fornecedor (token do link ou sessão dele). Pedido não-FOB = []. */
    async autorizadosParaFornecedor(orderId: string, token?: string | null): Promise<AutorizadoParaFornecedor[]> {
        const { data, error } = await supabase.rpc('purchase_order_retirada_autorizados_fornecedor', {
            p_order_id: orderId,
            p_token: token ?? null,
        });
        if (error) throw error;
        return ((data ?? []) as { nome: string; cpf?: string | null }[])
            .map(a => ({ nome: a.nome, cpf: a.cpf || undefined }));
    },
};
