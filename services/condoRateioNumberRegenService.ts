import { supabase } from '../lib/supabase';
import { generateDocumentNumber, NumberingContext } from './documentNumbering';

/**
 * "Regerar número" de um Rateio de Condomínio já fechado. Mesmo raciocínio de
 * `contractNumberRegenService.ts`, adaptado para `condominio_rateios`
 * (migration `aplicar_20270917000003_condo_rateio_number_history.sql`).
 *
 * Trava: `cobranca_gerada_em IS NOT NULL` (as cotas já viraram recebíveis do
 * condômino). Um rateio FECHADO mas ainda sem cobrança gerada pode regerar.
 */

/** `null` = pode regerar. String = motivo do bloqueio, pronto para a tela. */
export async function getCondoRateioNumberLockReason(rateioId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_condo_rateio_number_lock_reason', {
        p_rateio_id: rateioId,
    });
    if (error) throw new Error(`Falha ao verificar se o número pode ser alterado: ${error.message}`);
    return (data as string | null) ?? null;
}

export async function regenerateCondoRateioNumber(
    rateioId: string,
    organizationId: string,
    ctx: Omit<NumberingContext, 'organizationId'>,
): Promise<string> {
    const bloqueio = await getCondoRateioNumberLockReason(rateioId);
    if (bloqueio) throw new Error(bloqueio);

    const novo = await generateDocumentNumber('CONDO_RATEIO', organizationId, ctx);

    const { data, error } = await supabase.rpc('fn_regenerate_condo_rateio_number', {
        p_rateio_id: rateioId,
        p_new_number: novo,
    });
    if (error) throw new Error(error.message);

    return (data as string) ?? novo;
}

export interface CondoRateioNumberHistoryEntry {
    id: string;
    old_number: string | null;
    new_number: string;
    changed_by: string | null;
    changed_at: string;
}

export async function listCondoRateioNumberHistory(rateioId: string): Promise<CondoRateioNumberHistoryEntry[]> {
    const { data, error } = await supabase
        .from('condo_rateio_number_history')
        .select('id, old_number, new_number, changed_by, changed_at')
        .eq('rateio_id', rateioId)
        .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CondoRateioNumberHistoryEntry[];
}
