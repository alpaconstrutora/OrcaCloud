import { supabase } from '../lib/supabase';
import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Contratos de Locação — adaptador sobre o motor genérico de
 * `services/documentNumbering/` (Configurações do Sistema › Nomenclatura).
 *
 * Mantido de propósito na limpeza F5 (2026-08-18): resolve a ORGANIZAÇÃO a
 * partir do imóvel. Ver orderNumberingService.ts para o raciocínio completo.
 *
 * A unidade e o empreendimento chegam via `propertyId` (imóvel do Comercial)
 * — locação não tem obra (`contracts.project_id` fica nulo).
 */

export { MissingCodeError };

export interface RentalNumberingExtra {
    /** Necessário só se a máscara configurada usar {Cliente}. */
    clientId?: string | null;
    /** Necessário só se a máscara configurada usar {Centro de custo}. */
    costCenterId?: string | null;
}

export async function generateRentalContractNumber(propertyId: string, extra: RentalNumberingExtra = {}): Promise<string> {
    if (!propertyId) throw new MissingCodeError('Negociação sem unidade — selecione o imóvel antes de gerar o contrato.');

    const { data: property, error } = await supabase
        .from('commercial_properties')
        .select('organization_id')
        .eq('id', propertyId)
        .single();
    if (error) throw error;
    if (!property?.organization_id) throw new MissingCodeError('O imóvel selecionado não está vinculado a uma organização.');

    return generateDocumentNumber('RENTAL_CONTRACT', property.organization_id, {
        propertyId,
        unitPurpose: 'RENTAL',
        clientId: extra.clientId ?? undefined,
        costCenterId: extra.costCenterId ?? undefined,
    });
}
