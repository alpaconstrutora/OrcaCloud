import { supabase } from '../lib/supabase';
import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Contratos de Venda de Unidades — invólucro fino sobre o motor
 * genérico de `services/documentNumbering/` (Configurações do Sistema ›
 * Nomenclatura). Ver orderNumberingService.ts / rentalContractNumberingService.ts
 * para o raciocínio completo. Contador independente do de locação, mesmo
 * quando a unidade é a mesma.
 */

export { MissingCodeError };
/** @deprecated use MissingCodeError */
export { MissingCodeError as MissingUnitError };

export interface UnitSaleNumberingExtra {
    /** Necessário só se a máscara configurada usar {Cliente}. */
    clientId?: string | null;
    /** Necessário só se a máscara configurada usar {Centro de custo}. */
    costCenterId?: string | null;
}

export async function generateUnitSaleContractNumber(propertyId: string, extra: UnitSaleNumberingExtra = {}): Promise<string> {
    if (!propertyId) throw new MissingCodeError('Negociação sem unidade — selecione o imóvel antes de gerar o contrato.');

    const { data: property, error } = await supabase
        .from('commercial_properties')
        .select('organization_id')
        .eq('id', propertyId)
        .single();
    if (error) throw error;
    if (!property?.organization_id) throw new MissingCodeError('O imóvel selecionado não está vinculado a uma organização.');

    return generateDocumentNumber('UNIT_SALE_CONTRACT', property.organization_id, {
        propertyId,
        unitPurpose: 'SALE',
        clientId: extra.clientId ?? undefined,
        costCenterId: extra.costCenterId ?? undefined,
    });
}
