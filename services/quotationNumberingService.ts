import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';
import { resolveOrderCodes, MissingCodeError } from './orderNumberingService';

/**
 * Numeração de Cotação (Suprimentos) — `QT-{empreendimento}-{obra}-{seq}`.
 *
 * Cópia literal do mecanismo de `orderNumberingService.ts` (Numeração de
 * Pedidos): a máscara mora no mesmo `AppSettings` (localStorage,
 * `opura_app_settings`), sempre ativa. O sequencial é por obra e vem do
 * banco (`fn_next_quotation_seq`), pelo mesmo motivo de concorrência do PC.
 */

export { MissingCodeError };

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatQuotationNumber(
    codes: { empreendimentoCode: string; obraCode: string },
    seq: number,
    settings: Pick<AppSettings, 'quotationPrefix' | 'quotationNumberPattern' | 'quotationSeqPadding'>,
): string {
    const prefixo = (settings.quotationPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.quotationSeqPadding) || 1);

    return (settings.quotationNumberPattern || '{prefixo}-{empreendimento}-{obra}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{empreendimento}/g, codes.empreendimentoCode)
        .replace(/{obra}/g, codes.obraCode)
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da obra e devolve o número completo da cotação.
 * Reusa `resolveOrderCodes` (mesma regra de vínculo obra→empreendimento do PC);
 * a mensagem de `MissingCodeError` fala em "pedido" — reescrita aqui para "cotação".
 */
export async function generateQuotationNumber(projectId: string): Promise<string> {
    let codes;
    try {
        codes = await resolveOrderCodes(projectId);
    } catch (e) {
        if (e instanceof MissingCodeError) {
            throw new MissingCodeError(
                e.message
                    .replace('o número do pedido', 'o número da cotação')
                    .replace('antes de criar o pedido', 'antes de criar a cotação'),
            );
        }
        throw e;
    }

    const { data: seq, error } = await supabase.rpc('fn_next_quotation_seq', {
        p_project_id: projectId,
    });
    if (error) throw new Error(`Falha ao gerar o número da cotação: ${error.message}`);

    return formatQuotationNumber(codes, Number(seq), appSettingsService.get());
}
