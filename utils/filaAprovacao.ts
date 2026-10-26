/**
 * Fila de Aprovações › "Aprovar selecionados" (26/10/2026). O lote é o que está
 * marcado, PENDENTE e NA TELA: marcar, trocar o filtro e aprovar não pode levar
 * junto o que o filtro escondeu — aprovação é dinheiro liberado, e o usuário
 * aprova o que vê.
 */
export function itensDoLote<T extends { id: string; approval_status: string }>(naTela: T[], selecionados: Set<string>): T[] {
    return naTela.filter(i => selecionados.has(i.id) && i.approval_status === 'PENDENTE');
}

/**
 * Tipos oferecidos no filtro "Tipo" da fila: só os que existem nela (desde 26/10/2026
 * contrato e pedido de compra não entram mais — o pago são as parcelas), na ordem do
 * mapa de rótulos. O escolhido fica na lista mesmo vazio, para dar para trocar.
 */
export function tiposPresentes<T extends string>(itens: { entity: string }[], ordem: T[], escolhido: string): T[] {
    const presentes = new Set(itens.map(i => i.entity));
    return ordem.filter(k => presentes.has(k) || k === escolhido);
}
