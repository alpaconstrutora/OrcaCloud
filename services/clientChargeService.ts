import { supabase } from '../lib/supabase';
import { cobrancaAtiva } from '../utils/asaasEventos';

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
    /** PNG em base64 — só vem do `emit` e de `qrDaCobranca`, fora do COLS da lista (pesa). */
    pix_qr_image?: string;
    pix_expiration?: string;
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
    pix_qr_image?: string;
}

const COLS = 'id,organization_id,transaction_id,client_id,provider,asaas_payment_id,billing_type,value,due_date,status,invoice_url,bank_slip_url,pix_payload,description,party_name,party_email,paid_at,created_at';

export const clientChargeService = {

    /** Emite a cobrança no Asaas via Edge Function. */
    async emit(
        organizationId: string,
        transactionId: string,
        billingType: BillingType = 'BOLETO',
        charges?: { fine_percent?: number; interest_percent_month?: number; discount_percent?: number; discount_days?: number },
    ): Promise<EmitChargeResult> {
        const { data, error } = await supabase.functions.invoke('asaas-charge', {
            body: {
                organization_id: organizationId,
                transaction_id: transactionId,
                billing_type: billingType,
                ...charges,
            },
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
        organizationId: string | null,
        filters?: { status?: string; transactionId?: string; limit?: number },
    ): Promise<ClientCharge[]> {
        let q = supabase
            .from('client_charges')
            .select(COLS)
            .order('created_at', { ascending: false })
            .limit(filters?.limit ?? 200);
        if (organizationId) q = q.eq('organization_id', organizationId);
        if (filters?.status)        q = q.eq('status', filters.status);
        if (filters?.transactionId) q = q.eq('transaction_id', filters.transactionId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as ClientCharge[];
    },

    /** Reenvia o boleto por e-mail (segunda via). Apenas BOLETO; PIX não suporta. */
    async resend(organizationId: string, chargeId: string, email?: string): Promise<{ ok: boolean; email: string | null }> {
        const { data, error } = await supabase.functions.invoke('asaas-charge', {
            body: { organization_id: organizationId, charge_id: chargeId, action: 'resend', email },
        });
        if (error) {
            let detail = '';
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.json === 'function') {
                try { const b = await ctx.json(); detail = b?.error || ''; } catch { /* noop */ }
            }
            throw new Error(detail || error.message);
        }
        if (data?.error) throw new Error(data.error);
        return data as { ok: boolean; email: string | null };
    },

    /** QR do PIX de uma cobrança (imagem base64 + copia-e-cola), lido sob demanda. */
    async qrDaCobranca(chargeId: string): Promise<{ pix_qr_image: string | null; pix_payload: string | null; pix_expiration: string | null }> {
        const { data, error } = await supabase
            .from('client_charges')
            .select('pix_qr_image,pix_payload,pix_expiration')
            .eq('id', chargeId)
            .maybeSingle();
        if (error) throw error;
        return {
            pix_qr_image: data?.pix_qr_image ?? null,
            pix_payload: data?.pix_payload ?? null,
            pix_expiration: data?.pix_expiration ?? null,
        };
    },

    /**
     * Mapa transaction_id → cobrança VIVA mais recente (badge "Cobrança" ×
     * "Emitir" na grid de AR). Cancelada/removida/estornada não conta: antes a
     * mais recente vinha mesmo cancelada, e o recebível mostrava "Cobrança"
     * para um boleto morto em vez de oferecer "Emitir".
     * `organizationId` null = "Todas as organizações" (`list` já trata: sem `.eq`).
     */
    async byTransaction(organizationId: string | null): Promise<Record<string, ClientCharge>> {
        const rows = await this.list(organizationId, { limit: 500 });
        const map: Record<string, ClientCharge> = {};
        for (const c of rows) {
            if (!c.transaction_id || map[c.transaction_id]) continue;
            if (!cobrancaAtiva(c.status)) continue;
            map[c.transaction_id] = c;
        }
        return map;
    },
};
