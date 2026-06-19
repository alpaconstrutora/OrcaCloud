import { supabase } from '../lib/supabase';

export type BillingType = 'BOLETO' | 'PIX' | 'UNDEFINED';

export interface ClientCharge {
    id: string;
    organization_id: string;
    transaction_id?: string;
    client_id?: string;
    provider: string;
    asaas_payment_id?: string;
    billing_type: BillingType;
    value: number;
    due_date?: string;
    status: string;            // PENDING|RECEIVED|CONFIRMED|OVERDUE|REFUNDED|CANCELLED
    invoice_url?: string;
    bank_slip_url?: string;
    pix_payload?: string;
    description?: string;
    party_name?: string;
    party_email?: string;
    paid_at?: string;
    created_at?: string;
}

export interface EmitChargeResult {
    ok: boolean;
    charge: ClientCharge;
    invoice_url?: string;
    bank_slip_url?: string;
    pix_payload?: string;
}

const COLS = 'id,organization_id,transaction_id,client_id,provider,asaas_payment_id,billing_type,value,due_date,status,invoice_url,bank_slip_url,pix_payload,description,party_name,party_email,paid_at,created_at';

export const clientChargeService = {

    /** Emite a cobrança no Asaas via Edge Function. */
    async emit(
        organizationId: string,
        transactionId: string,
        billingType: BillingType = 'BOLETO',
    ): Promise<EmitChargeResult> {
        const { data, error } = await supabase.functions.invoke('asaas-charge', {
            body: { organization_id: organizationId, transaction_id: transactionId, billing_type: billingType },
        });
        if (error) {
            // A function retornou non-2xx; o corpo JSON tem { error, detail }.
            // supabase-js expõe a Response em error.context — lê o body real.
            let detail = '';
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.json === 'function') {
                try {
                    const body = await ctx.json();
                    detail = body?.error || (body?.detail ? JSON.stringify(body.detail) : '');
                } catch { /* corpo não-JSON */ }
            }
            throw new Error(detail || error.message);
        }
        if (data && (data as { error?: string }).error) {
            throw new Error((data as { error: string }).error);
        }
        return data as EmitChargeResult;
    },

    /** Cancela a(s) cobrança(s) ativa(s) do recebível no Asaas e reverte para PREVISTO. */
    async cancel(
        organizationId: string,
        transactionId: string,
    ): Promise<{ ok: boolean; cancelled: number }> {
        const { data, error } = await supabase.functions.invoke('asaas-charge', {
            body: { organization_id: organizationId, transaction_id: transactionId, action: 'cancel' },
        });
        if (error) {
            let detail = '';
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.json === 'function') {
                try {
                    const b = await ctx.json();
                    detail = b?.error || (b?.detail ? JSON.stringify(b.detail) : '');
                } catch { /* corpo não-JSON */ }
            }
            throw new Error(detail || error.message);
        }
        if (data && (data as { error?: string }).error) {
            throw new Error((data as { error: string }).error);
        }
        return data as { ok: boolean; cancelled: number };
    },

    /** Lista as cobranças de uma organização. */
    async list(
        organizationId: string,
        filters?: { status?: string; transactionId?: string; limit?: number },
    ): Promise<ClientCharge[]> {
        let q = supabase
            .from('client_charges')
            .select(COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(filters?.limit ?? 200);
        if (filters?.status)        q = q.eq('status', filters.status);
        if (filters?.transactionId) q = q.eq('transaction_id', filters.transactionId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as ClientCharge[];
    },

    /** Mapa transaction_id → cobrança mais recente (para badge na grid de AR). */
    async byTransaction(organizationId: string): Promise<Record<string, ClientCharge>> {
        const rows = await this.list(organizationId, { limit: 500 });
        const map: Record<string, ClientCharge> = {};
        for (const c of rows) {
            if (c.transaction_id && !map[c.transaction_id]) map[c.transaction_id] = c;
        }
        return map;
    },
};
