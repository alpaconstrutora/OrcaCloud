import { supabase } from '../lib/supabase';
import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Pedido de Compra — agora um invólucro fino sobre o motor
 * genérico de `services/documentNumbering/` (Configurações do Sistema ›
 * Nomenclatura). A máscara deixou de ser fixa (`{prefixo}-{empreendimento}-{obra}-{seq}`)
 * e passou a ser configurável por slots, por organização, persistida no banco
 * (`document_numbering_settings`) — não mais em `localStorage`.
 *
 * A assinatura pública (`generateOrderNumber(projectId)`) foi mantida para não
 * mexer nos chamadores (`orderService.ts`) na mesma leva. Ver
 * docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.
 */

export { MissingCodeError };

/**
 * Reserva o próximo sequencial (conforme a máscara configurada) e devolve o
 * número completo do pedido.
 */
export async function generateOrderNumber(projectId: string): Promise<string> {
    if (!projectId) throw new MissingCodeError('Selecione a obra antes de salvar o pedido.');

    const { data: project, error } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .single();
    if (error) throw error;
    if (!project?.organization_id) throw new MissingCodeError('A obra selecionada não está vinculada a uma organização.');

    return generateDocumentNumber('PURCHASE_ORDER', project.organization_id, { projectId });
}
