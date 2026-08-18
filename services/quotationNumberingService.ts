import { supabase } from '../lib/supabase';
import { generateDocumentNumber, MissingCodeError } from './documentNumbering';

/**
 * Numeração de Cotações de Suprimentos — invólucro fino sobre o motor
 * genérico de `services/documentNumbering/` (Configurações do Sistema ›
 * Nomenclatura). Ver orderNumberingService.ts para o raciocínio completo.
 */

export { MissingCodeError };

export async function generateQuotationNumber(projectId: string): Promise<string> {
    if (!projectId) throw new MissingCodeError('Selecione a obra antes de salvar a cotação.');

    const { data: project, error } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .single();
    if (error) throw error;
    if (!project?.organization_id) throw new MissingCodeError('A obra selecionada não está vinculada a uma organização.');

    return generateDocumentNumber('QUOTATION', project.organization_id, { projectId });
}
