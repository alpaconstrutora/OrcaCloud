import { supabase } from '../lib/supabase';
import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Pedido de Compra — adaptador sobre o motor genérico de
 * `services/documentNumbering/` (Configurações do Sistema › Nomenclatura).
 *
 * A máscara deixou de ser fixa (`{prefixo}-{empreendimento}-{obra}-{seq}`) e
 * passou a ser configurável por slots, por organização, persistida no banco
 * (`document_numbering_settings`) — não mais em `localStorage`.
 *
 * Este arquivo NÃO é resíduo da migração: a limpeza (F5, 2026-08-18) o manteve
 * de propósito. Ele faz o que o motor genérico não tem como adivinhar —
 * descobrir a ORGANIZAÇÃO a partir da obra — e dá nome de domínio à operação.
 * Dissolvê-lo nos chamadores duplicaria essa resolução em `orderService` e
 * `FiscalDocuments`.
 *
 * Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.
 */

export { MissingCodeError };

export interface OrderNumberingExtra {
    /** Necessário só se a máscara configurada usar {Fornecedor}. */
    supplierId?: string | null;
    /** Necessário só se a máscara configurada usar {Centro de custo}. */
    costCenterId?: string | null;
}

/**
 * Reserva o próximo sequencial (conforme a máscara configurada) e devolve o
 * número completo do pedido. `extra` só precisa ser preenchido se a
 * organização tiver colocado a variável correspondente na máscara —
 * omitir bloqueia a criação com `MissingCodeError` SE a máscara pedir essa
 * variável (ver resolveVariables em services/documentNumbering/resolvers.ts).
 */
export async function generateOrderNumber(projectId: string, extra: OrderNumberingExtra = {}): Promise<string> {
    if (!projectId) throw new MissingCodeError('Selecione a obra antes de salvar o pedido.');

    const { data: project, error } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .single();
    if (error) throw error;
    if (!project?.organization_id) throw new MissingCodeError('A obra selecionada não está vinculada a uma organização.');

    return generateDocumentNumber('PURCHASE_ORDER', project.organization_id, {
        projectId,
        supplierId: extra.supplierId ?? undefined,
        costCenterId: extra.costCenterId ?? undefined,
    });
}
