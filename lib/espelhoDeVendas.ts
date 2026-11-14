/**
 * Unidade do Comercial que saiu do Espelho de Vendas do empreendimento.
 *
 * Plano: docs/planos/2026-11-14-venda-de-ativos-unidades-analise-contrato-tabela.md (item 4).
 *
 * O edifício do Comercial que é o `commercial_building_id` de um empreendimento
 * espelha as unidades dele. Uma filha desse edifício **só faz parte da oferta**
 * se alguma unidade do espelho aponta para ela (`empreendimento_units.
 * commercial_property_id` ou `rental_property_id`). Sem isso ela é sobra:
 *   • "Desvincular" no Espelho apaga o ponteiro e deixa o imóvel no Comercial;
 *   • unidade apagada do espelho também deixa o imóvel;
 *   • republicar cria imóvel novo e o antigo fica para trás.
 * Medido em 14/11/2026 no Garden Cambuhy: 24 sobras, 20 delas na tabela de preços
 * ativa e visíveis no Portal do Corretor.
 *
 * A regra é DERIVADA na leitura, de propósito: nenhum caminho de escrita precisa
 * lembrar de apagar um flag. Espelho em SQL: `fn_unidade_fora_do_espelho_de_vendas`
 * (migration aplicar_20271114400000) — se mudar aqui, mude lá.
 *
 * Edifício sem empreendimento (imóvel avulso cadastrado no Comercial) não muda nada.
 */

export interface UnidadeDoComercial {
    id: string;
    parent_id?: string | null;
}

/**
 * @param prediosDoEspelho  ids de edifício que são `commercial_building_id` de algum empreendimento
 * @param vinculadas        ids de imóvel apontados por alguma unidade do espelho (venda ou locação)
 * @returns ids das unidades que saíram do espelho
 */
export function unidadesForaDoEspelho(
    unidades: UnidadeDoComercial[],
    prediosDoEspelho: ReadonlySet<string>,
    vinculadas: ReadonlySet<string>,
): Set<string> {
    const fora = new Set<string>();
    for (const u of unidades) {
        if (!u.parent_id || !prediosDoEspelho.has(u.parent_id)) continue;
        if (!vinculadas.has(u.id)) fora.add(u.id);
    }
    return fora;
}
