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
    pix_key_type?: string;
    favorecido_origem?: 'fornecedor' | 'colaborador' | 'socio' | 'avulso';
    asaas_authorized?: boolean | null;
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
    /** Por que o pagamento não pode ser disparado agora (portão de disparo). Vazio = pode. */
    bloqueios?: string[];
}

/** Opção de chave do cadastro do favorecido — a chave crua não vem ao navegador. */
export interface OpcaoChavePix {
    ref: string;
    rotulo: string;
    tipo: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null;
    chaveMascarada: string;
    titular: string | null;
    documento: string | null;
    principal: boolean;
    invalida: string | null;
}

export interface PixQuote {
    ok: boolean;
    titulo: { id: string; valor: number; vencimento: string | null; descricao: string | null; credor: string | null };
    favorecido: {
        origem: 'fornecedor' | 'colaborador' | 'socio' | 'avulso';
        motivo: string | null;
        nome: string | null;
        documento: string | null;
    };
    opcoes: OpcaoChavePix[];
    bloqueios: string[];
    bloqueios_avulso: string[];
    conta: { env: 'sandbox' | 'production'; cadastrada: boolean } | null;
}

/** Uma pergunta da Asaas à validação de saque e a resposta do OrçaCloud
 *  (asaas_saque_decisoes — só gestor da organização lê; para os demais, vazio). */
export interface DecisaoSaque {
    id: string;
    supplier_payment_id: string;
    decisao: 'APPROVED' | 'REFUSED';
    motivo: string | null;
    via_reserva: boolean;
    created_at: string;
}

/** Uma linha de supplier_payments_auditoria (gravada por gatilho, imutável). */
export interface EventoPagamento {
    id: string;
    supplier_payment_id: string;
    acao: 'criado' | 'status' | 'atualizado' | 'excluido';
    status_antes: string | null;
    status_depois: string | null;
    valor: number | null;
    autor: string;
    detalhe: {
        tipo?: string;
        favorecido?: string;
        favorecido_origem?: string;
        agendado_para?: string;
        taxa?: number;
        motivo?: string;
        comprovante?: string;
        aguardando_token?: boolean;
    };
    created_at: string;
}

export type DestinoPix =
    | { ref: string }
    | { avulso: { tipo: string; chave: string; nome: string; documento: string } };

export interface PixPayResult {
    ok: boolean;
    supplier_payment_id: string;
    asaas_transfer_id: string;
    status: string | null;
    aguardando_autorizacao: boolean;
    beneficiary_name: string | null;
}

export interface PayResult {
    ok: boolean;
    supplier_payment_id: string;
    asaas_bill_id: string | null;
    status: string | null;
    beneficiary_name: string | null;
}

const COLS = 'id,organization_id,transaction_id,boleto_id,supplier_id,provider,payment_type,asaas_bill_id,asaas_transfer_id,identification_field,beneficiary_name,value,fee,scheduled_date,status,failure_reason,receipt_url,pix_key_type,favorecido_origem,asaas_authorized,created_at';

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

    /** Favorecido, chaves PIX cadastradas e bloqueios do portão de disparo. */
    async pixQuote(organizationId: string, transactionId: string): Promise<PixQuote> {
        return invokeAsaasPayment<PixQuote>({
            organization_id: organizationId,
            transaction_id: transactionId,
            action: 'pix_quote',
        });
    },

    /** Dispara o PIX. O servidor relê a chave do cadastro pela `ref` e reaplica o portão. */
    async pixPay(organizationId: string, transactionId: string, destino: DestinoPix, scheduleDate?: string): Promise<PixPayResult> {
        return invokeAsaasPayment<PixPayResult>({
            organization_id: organizationId,
            transaction_id: transactionId,
            action: 'pix_pay',
            destino,
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

    /**
     * Última ordem de pagamento por título (badge na visão Parcelas). Lê só os
     * títulos pedidos — a lista de Contas a Pagar chega a milhares de linhas.
     */
    async byTransactions(transactionIds: string[]): Promise<Record<string, SupplierPayment>> {
        const mapa: Record<string, SupplierPayment> = {};
        for (let i = 0; i < transactionIds.length; i += 200) {
            const { data, error } = await supabase
                .from('supplier_payments')
                .select(COLS)
                .in('transaction_id', transactionIds.slice(i, i + 200))
                .order('created_at', { ascending: false });
            if (error) throw error;
            for (const r of (data || []) as SupplierPayment[]) {
                if (r.transaction_id && !mapa[r.transaction_id]) mapa[r.transaction_id] = r;
            }
        }
        return mapa;
    },

    /**
     * Histórico de pagamentos pela Asaas de um título: as tentativas que ainda
     * existem e a linha do tempo de TODAS — inclusive de pagamentos cujo
     * registro foi apagado depois (a auditoria guarda o transaction_id no
     * `detalhe` e não tem FK, de propósito).
     */
    async historicoDoTitulo(transactionId: string): Promise<{ pagamentos: SupplierPayment[]; eventos: EventoPagamento[]; decisoes: DecisaoSaque[] }> {
        const [pag, ev] = await Promise.all([
            supabase.from('supplier_payments').select(COLS)
                .eq('transaction_id', transactionId).order('created_at', { ascending: true }),
            supabase.from('supplier_payments_auditoria')
                .select('id,supplier_payment_id,acao,status_antes,status_depois,valor,autor,detalhe,created_at')
                .eq('detalhe->>transaction_id', transactionId).order('created_at', { ascending: true }),
        ]);
        if (pag.error) throw pag.error;
        if (ev.error) throw ev.error;
        const pagamentos = (pag.data || []) as SupplierPayment[];
        const eventos = (ev.data || []) as unknown as EventoPagamento[];
        // Validação de saque: das tentativas deste título (as excluídas também,
        // pelo id que ficou na auditoria). RLS deixa só gestor ler — sem erro.
        const ids = [...new Set([...pagamentos.map(p => p.id), ...eventos.map(e => e.supplier_payment_id)])];
        let decisoes: DecisaoSaque[] = [];
        if (ids.length) {
            const { data, error } = await supabase.from('asaas_saque_decisoes')
                .select('id,supplier_payment_id,decisao,motivo,via_reserva,created_at')
                .in('supplier_payment_id', ids).order('created_at', { ascending: true });
            if (!error) decisoes = (data || []) as DecisaoSaque[];
        }
        return { pagamentos, eventos, decisoes };
    },

    /** Última ordem de pagamento de um boleto (para exibir status na UI). */
    async byBoleto(organizationId: string, boletoId: string): Promise<SupplierPayment | null> {
        const rows = await this.list(organizationId, { boletoId });
        return rows[0] ?? null;
    },
};
