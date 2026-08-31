import { supabase } from '../lib/supabase';
import { generateDocumentNumber, NumberingContext } from './documentNumbering';

/**
 * "Regerar número" de um Pedido de Compra já existente — Configurações do
 * Sistema › Nomenclatura aplicada a um documento que já existe. Mesmo
 * raciocínio de `contractNumberRegenService.ts`, adaptado para
 * `purchase_orders` (migration `aplicar_20270917000001_purchase_order_number_history.sql`).
 *
 * Trava: qualquer status ≠ 'Rascunho' (é quando o pedido sai para o
 * fornecedor — webhook/WhatsApp/e-mail, ver `orderService.ts:updateOrder`).
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getOrderNumberLockReason(orderId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_purchase_order_number_lock_reason', {
        p_order_id: orderId,
    });
    if (error) throw new Error(`Falha ao verificar se o número pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

/**
 * Gera um número novo pela máscara vigente e o grava, registrando o anterior
 * em `purchase_order_number_history`. O servidor revalida a trava antes de
 * gravar.
 */
export async function regenerateOrderNumber(
    orderId: string,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const bloqueio = await getOrderNumberLockReason(orderId);
    if (bloqueio) throw new Error(bloqueio);

    const novo = await generateDocumentNumber('PURCHASE_ORDER', organizationId, ctx);

    const { data, error } = await supabase.rpc('fn_regenerate_purchase_order_number', {
        p_order_id: orderId,
        p_new_number: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface OrderNumberHistoryEntry {
    id: string;
    old_number: string | null;
    new_number: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listOrderNumberHistory(orderId: string): Promise<OrderNumberHistoryEntry[]> {
    const { data, error } = await supabase
        .from('purchase_order_number_history')
        .select('id, old_number, new_number, changed_by, changed_at')
        .eq('purchase_order_id', orderId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as OrderNumberHistoryEntry[];
}
