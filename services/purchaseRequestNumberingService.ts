import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Solicitações de Compra — adaptador sobre o motor genérico de
 * `services/documentNumbering/` (Configurações do Sistema › Nomenclatura).
 *
 * Diferente de quotationNumberingService, a organização NÃO é buscada pela
 * obra: a SC já grava `organization_id` (a da obra, conferida pelo trigger
 * fn_purchase_requests_guard), e quem chama já a tem em mãos.
 */

export { MissingCodeError };

export async function generatePurchaseRequestNumber(organizationId: string, projectId: string): Promise<string> {
    if (!projectId) throw new MissingCodeError('Selecione a obra antes de salvar a solicitação.');
    return generateDocumentNumber('PURCHASE_REQUEST', organizationId, { projectId });
}
