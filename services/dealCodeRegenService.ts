import { supabase } from '../lib/supabase';
import { generateDocumentNumber, NumberingContext } from './documentNumbering';

/**
 * "Regerar número" do CÓDIGO de uma negociação já existente
 * (`commercial_deals.code` — Venda de Unidades/SALE_DEAL ou
 * Locação/RENTAL_DEAL). Mesmo raciocínio de `contractNumberRegenService.ts`,
 * adaptado para `commercial_deals` (migration
 * `aplicar_20270918000001_commercial_deal_code_history.sql`).
 *
 * ⚠️ Não confundir com `contractNumberRegenService.ts` — aquele regera o
 * número do CONTRATO gerado a partir da negociação (`contracts.number`); este
 * regera o código da negociação em si.
 *
 * Trava: já existe um contrato vinculado a esta negociação
 * (`contracts.deal_id`) — a negociação virou outra coisa com número próprio.
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getDealCodeLockReason(dealId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_deal_code_lock_reason', {
        p_deal_id: dealId,
    });
    if (error) throw new Error(`Falha ao verificar se o código pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

export async function regenerateDealCode(
    dealId: string,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const bloqueio = await getDealCodeLockReason(dealId);
    if (bloqueio) throw new Error(bloqueio);

    const docType = ctx.unitPurpose === 'RENTAL' ? 'RENTAL_DEAL' : 'SALE_DEAL';
    const novo = await generateDocumentNumber(docType, organizationId, ctx);

    const { data, error } = await supabase.rpc('fn_regenerate_deal_code', {
        p_deal_id: dealId,
        p_new_code: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface DealCodeHistoryEntry {
    id: string;
    old_code: string | null;
    new_code: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listDealCodeHistory(dealId: string): Promise<DealCodeHistoryEntry[]> {
    const { data, error } = await supabase
        .from('commercial_deal_code_history')
        .select('id, old_code, new_code, changed_by, changed_at')
        .eq('deal_id', dealId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DealCodeHistoryEntry[];
}
