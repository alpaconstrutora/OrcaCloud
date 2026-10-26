/**
 * Fila de Aprovações › "Aprovar selecionados" (26/10/2026). O lote é o que está
 * marcado, PENDENTE e NA TELA: marcar, trocar o filtro e aprovar não pode levar
 * junto o que o filtro escondeu — aprovação é dinheiro liberado, e o usuário
 * aprova o que vê.
 */
export function itensDoLote<T extends { id: string; approval_status: string }>(naTela: T[], selecionados: Set<string>): T[] {
    return naTela.filter(i => selecionados.has(i.id) && i.approval_status === 'PENDENTE');
}
