/**
 * Alçada de aprovação por usuário (10/11/2026) — o que a tela mostra.
 *
 * Quem pode aprovar é decidido no BANCO: `approval_approvers` diz quem aprova cada
 * nível (por faixa de valor ou por tipo de item), `fn_approval_action_queue` devolve
 * `pode_aprovar`/`vez_de` e o gatilho `trg_zz_alcada_trava_passo` recusa o resto com
 * `ALCADA_NAO_PERMITE: …`. Nível sem ninguém cadastrado = liberado a todos.
 *
 * Plano: docs/planos/2026-11-10-alcada-aprovacao-por-usuario.md
 */

/** Itens sem valor: a alçada é por TIPO. Mesma lista do CHECK de `approval_approvers.entity_type`. */
export const ENTIDADES_POR_TIPO = [
    { entity: 'blueprint_snapshot', rotulo: 'Revisão de planta' },
    { entity: 'doc_gen_documento', rotulo: 'Ofício' },
    { entity: 'purchase_request', rotulo: 'Solicitação de compra' },
    { entity: 'process_step', rotulo: 'Etapa de processo' },
] as const;

export type EntidadePorTipo = (typeof ENTIDADES_POR_TIPO)[number]['entity'];

const POR_TIPO = new Set<string>(ENTIDADES_POR_TIPO.map(t => t.entity));

/** Itens com valor (título, DARF, contrato, pedido) vão pela faixa; os sem valor, pelo tipo. */
export function alvoDaAlcada(entity: string): 'faixa' | 'tipo' {
    return POR_TIPO.has(entity) ? 'tipo' : 'faixa';
}

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function juntarNomes(nomes: readonly string[]): string {
    if (nomes.length <= 1) return nomes[0] ?? '';
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** "Vez de Bruna e Iago"; `null` quando o nível está liberado a todos. */
export function vezDeTexto(vezDe: readonly string[] | null | undefined): string | null {
    if (!vezDe?.length) return null;
    return `Vez de ${juntarNomes(vezDe)}`;
}

/**
 * Por que aprovar/rejeitar está desligado para quem está logado. `null` = pode.
 * `pode_aprovar` ausente (resposta antiga da fila) não desliga nada — quem decide
 * de fato é o gatilho no banco.
 */
export function motivoSemAlcada(item: { pode_aprovar?: boolean | null; vez_de?: readonly string[] | null }): string | null {
    if (item.pode_aprovar !== false) return null;
    const nomes = juntarNomes(item.vez_de ?? []);
    return nomes
        ? `Este nível é aprovado por ${nomes}. Para aprovar, peça ao dono ou a um administrador da organização para incluir você em Aprovações › Faixas.`
        : 'Você não está na alçada deste nível. Peça ao dono ou a um administrador da organização para incluir você em Aprovações › Faixas.';
}

const CODIGO = 'ALCADA_NAO_PERMITE:';

/** A frase do gatilho, sem o código nem o "Erro ao aprovar:" na frente. `null` se o erro é outro. */
export function mensagemDaAlcada(mensagem: string | null | undefined): string | null {
    const i = mensagem?.indexOf(CODIGO) ?? -1;
    if (!mensagem || i < 0) return null;
    const frase = mensagem.slice(i + CODIGO.length).trim();
    return frase.charAt(0).toUpperCase() + frase.slice(1);
}
