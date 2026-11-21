import { supabase } from '../lib/supabase';
import { speService } from './speService';

export type CapitalCallStatus = 'aberta' | 'parcialmente_paga' | 'paga' | 'cancelada';
export type CapitalCallItemStatus = 'pendente' | 'parcial' | 'pago' | 'atrasado';

export const CAPITAL_CALL_STATUS_LABELS: Record<CapitalCallStatus, string> = {
    aberta: 'Aberta',
    parcialmente_paga: 'Parcialmente paga',
    paga: 'Paga',
    cancelada: 'Cancelada',
};

export const CAPITAL_CALL_ITEM_STATUS_LABELS: Record<CapitalCallItemStatus, string> = {
    pendente: 'Pendente',
    parcial: 'Parcial',
    pago: 'Pago',
    atrasado: 'Atrasado',
};

export interface CapitalCall {
    id?: string;
    organization_id: string;
    spe_entity_id: string;
    title: string;
    description?: string | null;
    total_amount: number;
    issue_date: string;
    due_date: string;
    status: CapitalCallStatus;
    created_by_email?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface CapitalCallItem {
    id?: string;
    organization_id: string;
    capital_call_id: string;
    spe_partner_id: string;
    amount_due: number;
    amount_paid: number;
    status: CapitalCallItemStatus;
    paid_at?: string | null;
    payment_reference?: string | null;
    created_at?: string;
    updated_at?: string;
    // joined (não persistido)
    investor_name?: string;
}

const CALL_COLS = 'id, organization_id, spe_entity_id, title, description, total_amount, issue_date, due_date, status, created_by_email, created_at, updated_at';
const ITEM_COLS = 'id, organization_id, capital_call_id, spe_partner_id, amount_due, amount_paid, status, paid_at, payment_reference, created_at, updated_at';

export const capitalCallService = {
    async listCalls(speEntityId: string): Promise<CapitalCall[]> {
        const { data, error } = await supabase
            .from('capital_calls')
            .select(CALL_COLS)
            .eq('spe_entity_id', speEntityId)
            .order('issue_date', { ascending: false });
        if (error) throw error;
        return (data ?? []) as CapitalCall[];
    },

    async listItems(capitalCallId: string): Promise<CapitalCallItem[]> {
        const { data, error } = await supabase
            .from('capital_call_items')
            .select(`${ITEM_COLS}, spe_partners(investors(name))`)
            .eq('capital_call_id', capitalCallId);
        if (error) throw error;
        return ((data ?? []) as any[]).map(i => ({
            ...i,
            investor_name: i.spe_partners?.investors?.name,
        })) as CapitalCallItem[];
    },

    /** Emite uma chamada de capital, ratear entre os sócios informados (proporcional ao aporte de cada item). */
    async createCall(
        call: Omit<CapitalCall, 'id' | 'created_at' | 'updated_at' | 'status'>,
        items: { spe_partner_id: string; amount_due: number }[],
    ): Promise<CapitalCall> {
        const { data: savedCall, error } = await supabase
            .from('capital_calls')
            .insert({ ...call, status: 'aberta' })
            .select(CALL_COLS)
            .single();
        if (error) throw error;

        const itemPayload = items.map(i => ({
            organization_id: call.organization_id,
            capital_call_id: savedCall.id,
            spe_partner_id: i.spe_partner_id,
            amount_due: i.amount_due,
            amount_paid: 0,
            status: 'pendente' as CapitalCallItemStatus,
        }));
        const { error: itemsError } = await supabase.from('capital_call_items').insert(itemPayload);
        if (itemsError) throw itemsError;

        // mantém os totalizadores de spe_partners em sincronia
        await Promise.all(items.map(i => speService.addCapitalCall(i.spe_partner_id, i.amount_due)));

        return savedCall as CapitalCall;
    },

    async cancelCall(id: string): Promise<void> {
        const { error } = await supabase
            .from('capital_calls')
            .update({ status: 'cancelada', updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Registra pagamento (total ou parcial) de um item da chamada. Uma transação no banco
     * (`fn_chamada_de_capital_registrar_pagamento`): item, `capital_paid` do sócio, status da
     * chamada e o aporte 'liquidado' do investidor na obra da SPE (`investor_contributions`).
     * `semObra` = a SPE não tem obra, então o pagamento não entrou no extrato do investidor.
     */
    async registerPayment(item: CapitalCallItem, amountPaid: number, paymentReference?: string): Promise<{ semObra: boolean }> {
        if (!item.id) return { semObra: false };
        const { data, error } = await supabase.rpc('fn_chamada_de_capital_registrar_pagamento', {
            p_item_id: item.id,
            p_valor: amountPaid,
            p_referencia: paymentReference ?? null,
        });
        if (error) throw error;
        return { semObra: Boolean((data as { sem_obra?: boolean } | null)?.sem_obra) };
    },

    async markOverdueItems(capitalCallId: string): Promise<void> {
        const { data: call } = await supabase.from('capital_calls').select('due_date').eq('id', capitalCallId).single();
        if (!call || new Date(call.due_date) >= new Date()) return;
        await supabase
            .from('capital_call_items')
            .update({ status: 'atrasado' })
            .eq('capital_call_id', capitalCallId)
            .eq('status', 'pendente');
    },
};
