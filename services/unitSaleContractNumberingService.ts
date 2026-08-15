import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';

/**
 * Numeração de Contratos de VENDA DE UNIDADES — `CV-{empreendimento}-{unidade}-{seq}`.
 *
 * Gêmeo de `rentalContractNumberingService.ts`, com contador independente: uma
 * mesma unidade pode ter contrato de locação e, depois, de venda — as duas
 * sequências não podem se misturar. Ver o cabeçalho daquele arquivo para o
 * raciocínio completo (unidade em vez de obra, chegada via
 * `vw_unit_property_map`).
 *
 * Substitui o encadeamento anterior em `createFromDeal` — RPC
 * `get_next_contract_number` genérica, com fallback para `Date.now()` e outro
 * para COUNT(*) — que produzia números de formatos diferentes conforme qual
 * ramo respondia, e no ramo do COUNT repetia número já usado após qualquer
 * exclusão.
 */

export class MissingUnitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingUnitError';
    }
}

interface ResolvedUnit {
    unitId: string;
    unitName: string;
    empreendimentoCode: string;
}

const clean = (v?: string | null) => (v ?? '').trim();

export async function resolveSaleUnit(propertyId: string): Promise<ResolvedUnit> {
    if (!propertyId) throw new MissingUnitError('Negociação sem unidade — selecione o imóvel antes de gerar o contrato.');

    const { data, error } = await supabase
        .from('vw_unit_property_map')
        .select('unit_id, unit_name, empreendimento_code')
        .eq('property_id', propertyId)
        .eq('purpose', 'SALE')
        .maybeSingle();
    if (error) throw error;

    if (!data?.unit_id) {
        throw new MissingUnitError(
            'Não é possível gerar o número do contrato: o imóvel não está vinculado a uma unidade de Empreendimento. ' +
            'Vincule a unidade em Empreendimentos › Torres › Unidades antes de gerar o contrato.',
        );
    }

    return {
        unitId: data.unit_id,
        unitName: clean(data.unit_name),
        empreendimentoCode: clean((data as { empreendimento_code?: string }).empreendimento_code),
    };
}

/** Aplica a máscara. Separado da busca para poder ser usado no preview das Configurações. */
export function formatUnitSaleContractNumber(
    unit: { empreendimentoCode: string; unitName: string },
    seq: number,
    settings: Pick<AppSettings, 'unitSaleContractPrefix' | 'unitSaleContractNumberPattern' | 'unitSaleContractSeqPadding'>,
): string {
    const prefixo = (settings.unitSaleContractPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.unitSaleContractSeqPadding) || 1);

    return (settings.unitSaleContractNumberPattern || '{prefixo}-{empreendimento}-{unidade}-{seq}')
        .replace(/{prefixo}/g, prefixo)
        .replace(/{empreendimento}/g, unit.empreendimentoCode)
        .replace(/{unidade}/g, unit.unitName)
        .replace(/{seq}/g, String(seq).padStart(padding, '0'));
}

/**
 * Reserva o próximo sequencial da unidade e devolve o número completo do
 * contrato. O sequencial é consumido mesmo que o insert do contrato falhe
 * depois — buraco na numeração é preferível a número repetido.
 */
export async function generateUnitSaleContractNumber(propertyId: string): Promise<string> {
    const unit = await resolveSaleUnit(propertyId);

    const { data: seq, error } = await supabase.rpc('fn_next_unit_sale_contract_seq', {
        p_unit_id: unit.unitId,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato de venda: ${error.message}`);

    return formatUnitSaleContractNumber(unit, Number(seq), appSettingsService.get());
}
