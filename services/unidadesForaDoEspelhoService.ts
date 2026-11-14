import { supabase } from '../lib/supabase';
import { unidadesForaDoEspelho, type UnidadeDoComercial } from '../lib/espelhoDeVendas';

/**
 * Leitura da regra de `lib/espelhoDeVendas.ts` no banco: quais destas unidades do
 * Comercial saíram do Espelho de Vendas do empreendimento.
 *
 * Duas consultas pequenas (edifícios do espelho, ponteiros das unidades), em lotes
 * para não estourar a URL do PostgREST com centenas de ids.
 *
 * Falha na leitura devolve conjunto VAZIO (não corta nada) e avisa no console: na
 * dúvida a unidade aparece, que é como a tela era antes. Esconder o estoque inteiro
 * por um erro de rede seria pior que mostrar uma sobra.
 */
const LOTE = 150;

function emLotes<T>(itens: T[]): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
    return lotes;
}

export async function idsForaDoEspelhoDeVendas(unidades: UnidadeDoComercial[]): Promise<Set<string>> {
    const pais = [...new Set(unidades.map(u => u.parent_id).filter((p): p is string => !!p))];
    if (pais.length === 0) return new Set();
    try {
        const prediosDoEspelho = new Set<string>();
        for (const lote of emLotes(pais)) {
            const { data, error } = await supabase
                .from('empreendimentos')
                .select('commercial_building_id')
                .in('commercial_building_id', lote);
            if (error) throw error;
            for (const r of data ?? []) if (r.commercial_building_id) prediosDoEspelho.add(r.commercial_building_id);
        }
        if (prediosDoEspelho.size === 0) return new Set();

        const candidatas = unidades.filter(u => u.parent_id && prediosDoEspelho.has(u.parent_id)).map(u => u.id);
        if (candidatas.length === 0) return new Set();

        const vinculadas = new Set<string>();
        for (const lote of emLotes(candidatas)) {
            const lista = lote.join(',');
            const { data, error } = await supabase
                .from('empreendimento_units')
                .select('commercial_property_id, rental_property_id')
                .or(`commercial_property_id.in.(${lista}),rental_property_id.in.(${lista})`);
            if (error) throw error;
            for (const r of data ?? []) {
                if (r.commercial_property_id) vinculadas.add(r.commercial_property_id);
                if (r.rental_property_id) vinculadas.add(r.rental_property_id);
            }
        }
        return unidadesForaDoEspelho(unidades, prediosDoEspelho, vinculadas);
    } catch (err) {
        console.warn('[espelhoDeVendas] não foi possível conferir o Espelho de Vendas — nenhuma unidade foi cortada:', err);
        return new Set();
    }
}

/** Atalho: devolve só as unidades que seguem no espelho (ou fora de empreendimento). */
export async function semUnidadesForaDoEspelho<T extends UnidadeDoComercial>(unidades: T[]): Promise<T[]> {
    const fora = await idsForaDoEspelhoDeVendas(unidades);
    return fora.size === 0 ? unidades : unidades.filter(u => !fora.has(u.id));
}
