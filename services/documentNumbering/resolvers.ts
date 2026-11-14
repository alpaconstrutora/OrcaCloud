import { supabase } from '../../lib/supabase';
import { criarResolvedores } from './motor';
import { NumberingContext, VariableToken } from './types';

/**
 * Resolução de variáveis da Nomenclatura no NAVEGADOR — a regra mora em
 * `motor.ts` (`criarResolvedores(db)`), o mesmo código que a Edge Function
 * `pedido-fast` usa com o cliente dela (docs/planos/2026-11-14-pedido-fast.md).
 * NUNCA bloqueia a criação do documento: ver o comentário do topo de `motor.ts`.
 *
 * O cliente é lido a cada chamada (e não guardado no carregamento do módulo)
 * para os testes que trocam o `supabase` por mock continuarem valendo.
 */
export async function resolveVariables(
    tokens: VariableToken[],
    ctx: NumberingContext,
): Promise<Partial<Record<VariableToken, string>>> {
    return criarResolvedores(supabase).resolveVariables(tokens, ctx);
}
