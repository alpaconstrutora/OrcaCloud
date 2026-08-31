import { supabase } from '../lib/supabase';
import { generateDocumentNumber, NumberingContext } from './documentNumbering';

/**
 * "Regerar número" de uma Cotação de Suprimentos já existente. Mesmo
 * raciocínio de `contractNumberRegenService.ts`, adaptado para
 * `quotation_requests` (migration
 * `aplicar_20270917000002_quotation_number_history.sql`).
 *
 * Trava: já existe resposta de fornecedor (`quotation_responses.status IN
 * ('Enviada','Selecionada','Recusada')` para aquele `request_id`) — a cotação
 * já fica visível no portal do fornecedor assim que criada, então o status da
 * cotação em si não é um bom sinal de "já saiu para fora".
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getQuotationNumberLockReason(requestId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_quotation_number_lock_reason', {
        p_request_id: requestId,
    });
    if (error) throw new Error(`Falha ao verificar se o número pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

export async function regenerateQuotationNumber(
    requestId: string,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const bloqueio = await getQuotationNumberLockReason(requestId);
    if (bloqueio) throw new Error(bloqueio);

    const novo = await generateDocumentNumber('QUOTATION', organizationId, ctx);

    const { data, error } = await supabase.rpc('fn_regenerate_quotation_number', {
        p_request_id: requestId,
        p_new_number: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface QuotationNumberHistoryEntry {
    id: string;
    old_number: string | null;
    new_number: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listQuotationNumberHistory(requestId: string): Promise<QuotationNumberHistoryEntry[]> {
    const { data, error } = await supabase
        .from('quotation_number_history')
        .select('id, old_number, new_number, changed_by, changed_at')
        .eq('quotation_request_id', requestId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as QuotationNumberHistoryEntry[];
}
