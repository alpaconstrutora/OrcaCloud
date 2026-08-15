import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';

/**
 * Numeração de Contratos de VENDA DE UNIDADES — `CV-{ano}-{seq}`.
 *
 * Gêmeo de `rentalContractNumberingService.ts` com sequência independente:
 * excluir ou criar contrato de locação não pode mexer no número da próxima
 * venda. Escopo do sequencial: organização + ano (contrato de venda de unidade
 * também não tem obra).
 *
 * Substitui o encadeamento anterior em `createFromDeal` — RPC
 * `get_next_contract_number` genérica, com fallback para `Date.now()` e outro
 * para COUNT(*) — que produzia números de formatos diferentes conforme qual
 * ramo respondia, e no ramo do COUNT repetia número já usado após qualquer
 * exclusão.
 */

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatUnitSaleContractNumber(
    year: number,
    seq: number,
    settings: Pick<AppSettings, 'unitSaleContractPrefix' | 'unitSaleContractNumberPattern' | 'unitSaleContractSeqPadding'>,
): string {
    const prefixo = (settings.unitSaleContractPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.unitSaleContractSeqPadding) || 1);

    return (settings.unitSaleContractNumberPattern || '{prefixo}-{ano}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{ano}/g, String(year))
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da organização/ano e devolve o número completo.
 * O sequencial é consumido mesmo que o insert do contrato falhe depois — buraco
 * na numeração é preferível a número repetido.
 */
export async function generateUnitSaleContractNumber(orgId: string, year: number): Promise<string> {
    if (!orgId) throw new Error('Negociação sem organização — impossível gerar o número do contrato.');

    const { data: seq, error } = await supabase.rpc('fn_next_unit_sale_contract_seq', {
        p_org_id: orgId,
        p_year: year,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato de venda: ${error.message}`);

    return formatUnitSaleContractNumber(year, Number(seq), appSettingsService.get());
}
