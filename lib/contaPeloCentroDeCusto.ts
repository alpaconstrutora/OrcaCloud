/**
 * Conta bancária preenchida pelo centro de custo (pedido de 09/11/2026).
 *
 * O centro de custo pode ter uma conta vinculada (`cost_centers_v2.payment_account_id`).
 * Ao escolher o centro num lançamento, a conta vem junto — mas só por cima do que a
 * própria regra preencheu: conta escolhida à mão nunca é trocada.
 *
 * Quem chama guarda `preenchida` (o valor que a regra pôs da última vez) e devolve
 * em `contaPreenchidaAntes` na próxima troca de centro.
 */
export function contaPeloCentroDeCusto(p: {
    contaAtual: string | null | undefined;
    contaPreenchidaAntes: string | null | undefined;
    contaDoCentro: string | null | undefined;
    /** Contas que a tela oferece — conta fora daqui (outra org, inativa) não entra. */
    contasDisponiveis: readonly string[];
}): { conta: string | null; preenchida: string | null } {
    const atual = p.contaAtual || null;
    const eraAutomatica = !atual || atual === (p.contaPreenchidaAntes || null);
    if (!eraAutomatica) return { conta: atual, preenchida: null };
    const doCentro = p.contaDoCentro && p.contasDisponiveis.includes(p.contaDoCentro) ? p.contaDoCentro : null;
    return { conta: doCentro, preenchida: doCentro };
}
