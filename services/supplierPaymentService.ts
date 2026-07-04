import { supabase } from '../lib/supabase';

export type SupplierPaymentType = 'BILL' | 'PIX_TRANSFER';
export type SupplierPaymentStatus =
    | 'AWAITING_APPROVAL' | 'APPROVED' | 'PENDING' | 'SCHEDULED'
    | 'DONE' | 'FAILED' | 'CANCELLED';

export interface SupplierPayment {
    id: string;
    organization_id: string;
    transaction_id?: string;
    boleto_id?: string;
    supplier_id?: string;
    provider: string;
    payment_type: SupplierPaymentType;
    asaas_bill_id?: string;
    asaas_transfer_id?: string;
    identification_field?: string;
    beneficiary_name?: string;
    value: number;
    fee?: number;
    scheduled_date?: string;
    status: SupplierPaymentStatus;
    failure_reason?: string;
    receipt_url?: string;
    created_at?: string;
}

export interface QuoteResult {
    ok: boolean;
    simulation: Record<string, unknown>;
    fee: number | null;
    beneficiary_name: string | null;
    beneficiary_name_source: 'asaas' | 'boleto_capturado';
    beneficiary_cpf_cnpj: string | null;
    is_overdue: boolean | null;
    real_value: number | null;
    captured_value: number | null;
    value_mismatch: boolean;
}

export interface PayResult {
    ok: boolean;
    supplier_payment_id: string;
    asaas_bill_id: string | null;
    status: string | null;
    beneficiary_name: string | null;
}

const COLS = 'id,organization_id,transaction_id,boleto_id,supplier_id,provider,payment_type,asaas_bill_id,asaas_transfer_id,identification_field,beneficiary_name,value,fee,scheduled_date,status,failure_reason,receipt_url,created_at';

async function invokeAsaasPayment<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('asaas-payment', { body });
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
    return data as T;
}

export const supplierPaymentService = {
    /** Simula o pagamento do boleto na Asaas — retorna o beneficiário real para confirmação. */
    async quote(organizationId: string, boletoId: string): Promise<QuoteResult> {
        return invokeAsaasPayment<QuoteResult>({
            organization_id: organizationId,
            boleto_id: boletoId,
            action: 'quote',
        });
    },

    /** Dispara o pagamento do boleto (BILL) na Asaas. Boleto precisa estar 'aprovado'. */
    async pay(organizationId: string, boletoId: string, scheduleDate?: string): Promise<PayResult> {
        return invokeAsaasPayment<PayResult>({
            organization_id: organizationId,
            boleto_id: boletoId,
            action: 'pay',
            schedule_date: scheduleDate,
        });
    },

    /** Cancela uma ordem de pagamento ainda não concluída. */
    async cancel(organizationId: string, supplierPaymentId: string): Promise<{ ok: boolean }> {
        return invokeAsaasPayment<{ ok: boolean }>({
            organization_id: organizationId,
            supplier_payment_id: supplierPaymentId,
            action: 'cancel',
        });
    },

    /** Lista pagamentos de título da organização. */
    async list(organizationId: string, filters?: { status?: SupplierPaymentStatus; boletoId?: string }): Promise<SupplierPayment[]> {
        let q = supabase
            .from('supplier_payments')
            .select(COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (filters?.status) q = q.eq('status', filters.status);
        if (filters?.boletoId) q = q.eq('boleto_id', filters.boletoId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as SupplierPayment[];
    },

    /** Última ordem de pagamento de um boleto (para exibir status na UI). */
    async byBoleto(organizationId: string, boletoId: string): Promise<SupplierPayment | null> {
        const rows = await this.list(organizationId, { boletoId });
        return rows[0] ?? null;
    },
};
