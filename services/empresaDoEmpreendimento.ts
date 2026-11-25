import { supabase } from '../lib/supabase';

/**
 * Empresa (companies.id) do EMPREENDIMENTO a que um imóvel comercial pertence —
 * a herança usada quando o próprio imóvel não tem `company_id`.
 *
 * A unidade NÃO tem `empreendimento_id`: liga por `tower_id` →
 * `empreendimento_towers.empreendimento_id` → `empreendimentos.company_id`. E o
 * imóvel liga à unidade por `rental_property_id` (Locação) ou
 * `commercial_property_id` (Venda).
 *
 * Um caminho só para os dois que precisam: o regime tributário da locação
 * (taxPayableService) e o locador dos documentos (rentalDocumentContextService).
 * Este último consultava `empreendimento_units.empreendimento_id`, coluna que não
 * existe: dava 400 engolido e a herança nunca funcionava (achado em 25/11/2026).
 *
 * Tolerante a erro: qualquer falha devolve null e quem chama segue para o
 * próximo degrau.
 */
export async function empresaDoEmpreendimentoDoImovel(propertyId: string | null | undefined): Promise<string | null> {
    if (!propertyId) return null;

    const torrePor = async (coluna: 'rental_property_id' | 'commercial_property_id'): Promise<string | null> => {
        const { data, error } = await supabase
            .from('empreendimento_units')
            .select('tower_id')
            .eq(coluna, propertyId)
            .limit(1);
        if (error) { console.warn(`[empresaDoEmpreendimento] busca por ${coluna} falhou:`, error.message); return null; }
        return (data as { tower_id?: string | null }[] | null)?.[0]?.tower_id ?? null;
    };

    try {
        const towerId = (await torrePor('rental_property_id')) ?? (await torrePor('commercial_property_id'));
        if (!towerId) return null;
        const { data: torre } = await supabase
            .from('empreendimento_towers')
            .select('empreendimento_id')
            .eq('id', towerId)
            .maybeSingle();
        const empId = (torre as { empreendimento_id?: string | null } | null)?.empreendimento_id ?? null;
        if (!empId) return null;
        const { data: emp } = await supabase
            .from('empreendimentos')
            .select('company_id')
            .eq('id', empId)
            .maybeSingle();
        return (emp as { company_id?: string | null } | null)?.company_id ?? null;
    } catch (e) {
        console.warn('[empresaDoEmpreendimento] herança do empreendimento não resolvida:', e);
        return null;
    }
}
