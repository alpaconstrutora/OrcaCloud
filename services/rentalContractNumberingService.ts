import { supabase } from '../lib/supabase';
import { appSettingsService, AppSettings } from './appSettingsService';

/**
 * Numeração de Contratos de LOCAÇÃO — `CL-{empreendimento}-{unidade}-{seq}`.
 *
 * Cópia do mecanismo de `orderNumberingService.ts` (Numeração de Pedidos): a
 * máscara mora no mesmo `AppSettings` (localStorage, `opura_app_settings`),
 * configurável em Configurações do Sistema › Nomenclatura › Contratos de
 * Locação, e o sequencial vem de um contador atômico no banco.
 *
 * A diferença é qual entidade fecha a máscara antes do `{seq}`. Em Pedidos é a
 * OBRA; contrato de locação não tem obra (`contracts.project_id` fica nulo —
 * REGRA #2 em contractService.ts). Ele chega no empreendimento por outro
 * caminho: a UNIDADE (`vw_unit_property_map`, que resolve
 * `commercial_properties.id` → `empreendimento_units` → torre →
 * `empreendimentos`). Por isso o contador aqui é por unidade, não por
 * organização/ano: o segundo contrato da MESMA unidade sai `-0002`, a unidade
 * vizinha recomeça do `-0001` — leitura literal do padrão de Pedidos aplicada
 * à última entidade antes do `{seq}`.
 *
 * Por não depender de código de obra, NÃO existe aqui o bloqueio
 * `MissingCodeError` que Pedidos aplica — mas sem empreendimento com `code`
 * cadastrado o token `{empreendimento}` sai vazio na máscara.
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

/**
 * Resolve a unidade e o código do empreendimento a partir do imóvel do
 * Comercial (`commercial_properties.id`) usado na negociação.
 *
 * `purpose` escolhe o lado da view (`RENTAL` aqui, `SALE` no serviço de
 * venda) — uma unidade pode ter os dois vínculos ao mesmo tempo
 * (`commercial_property_id` e `rental_property_id` são colunas distintas).
 */
export async function resolveRentalUnit(propertyId: string): Promise<ResolvedUnit> {
    if (!propertyId) throw new MissingUnitError('Negociação sem unidade — selecione o imóvel antes de gerar o contrato.');

    const { data, error } = await supabase
        .from('vw_unit_property_map')
        .select('unit_id, unit_name, empreendimento_code')
        .eq('property_id', propertyId)
        .eq('purpose', 'RENTAL')
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
export function formatRentalContractNumber(
    unit: { empreendimentoCode: string; unitName: string },
    seq: number,
    settings: Pick<AppSettings, 'rentalContractPrefix' | 'rentalContractNumberPattern' | 'rentalContractSeqPadding'>,
): string {
    const prefixo = (settings.rentalContractPrefix ?? '').trim().replace(/^-+|-+$/g, '');
    const padding = Math.max(1, Number(settings.rentalContractSeqPadding) || 1);

    return (settings.rentalContractNumberPattern || '{prefixo}-{empreendimento}-{unidade}-{seq}')
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
export async function generateRentalContractNumber(propertyId: string): Promise<string> {
    const unit = await resolveRentalUnit(propertyId);

    const { data: seq, error } = await supabase.rpc('fn_next_rental_contract_seq', {
        p_unit_id: unit.unitId,
    });
    if (error) throw new Error(`Falha ao gerar o número do contrato de locação: ${error.message}`);

    return formatRentalContractNumber(unit, Number(seq), appSettingsService.get());
}
