/**
 * Quais títulos são parcela de contrato com valor VARIÁVEL (por medição).
 *
 * As listas de Contas a Pagar/Receber vêm de views (`vw_payables`, `vw_receivables`),
 * que não expõem o campo computado `valor_variavel(internal_transactions)` — ele só
 * existe sobre a tabela. Quem precisa saber (o painel de baixa) pergunta aqui.
 * Plano: docs/planos/2026-10-17-contrato-valor-fixo-ou-por-medicao.md.
 */
import { supabase } from '../lib/supabase';

export async function idsDeValorVariavel(ids: string[]): Promise<Set<string>> {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (unicos.length === 0) return new Set();
    const { data, error } = await supabase
        .from('internal_transactions')
        .select('id, valor_variavel')
        .in('id', unicos);
    // Sem resposta, trata como fixo: o pior caso é o campo "Valor pago" não aparecer.
    if (error || !data) return new Set();
    return new Set((data as Array<{ id: string; valor_variavel: boolean | null }>)
        .filter(r => r.valor_variavel)
        .map(r => r.id));
}
