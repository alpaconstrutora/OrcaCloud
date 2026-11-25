import { supabase } from '../lib/supabase';
import { negociacaoDaCadeia } from '../utils/reajusteAniversario';

type Elo = { deal_id: string | null; parent_contract_id: string | null };

/**
 * Negociação de cada contrato de locação — o próprio `deal_id` ou, no renovado
 * (que não herda deal_id), o da raiz da cadeia por `parent_contract_id`. Lê os
 * pais que faltam, um nível por ida (para em 10). Usado para recortar as abas
 * Reajustes e Renovações pelo empreendimento aberto (pedido de 24/11/2026).
 */
export async function negociacoesDosContratos(
    contratos: { id: string; deal_id?: string | null; parent_contract_id?: string | null }[],
): Promise<Map<string, string | null>> {
    const elos = new Map<string, Elo>(contratos.map(c => [c.id, { deal_id: c.deal_id ?? null, parent_contract_id: c.parent_contract_id ?? null }]));
    for (let nivel = 0; nivel < 10; nivel++) {
        const faltam = [...new Set([...elos.values()]
            .filter(c => !c.deal_id && c.parent_contract_id && !elos.has(c.parent_contract_id))
            .map(c => c.parent_contract_id as string))];
        if (faltam.length === 0) break;
        const { data, error } = await supabase.from('contracts').select('id, deal_id, parent_contract_id').in('id', faltam);
        if (error) throw error;
        const lidos = (data ?? []) as ({ id: string } & Elo)[];
        if (lidos.length === 0) break;
        for (const c of lidos) elos.set(c.id, { deal_id: c.deal_id, parent_contract_id: c.parent_contract_id });
    }
    return new Map(contratos.map(c => [c.id, negociacaoDaCadeia(c.id, elos)]));
}
