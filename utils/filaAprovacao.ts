import { ORIGEM_PT, origemLabel } from './origemLabel';

/**
 * Fila de Aprovações › "Aprovar selecionados" (26/10/2026). O lote é o que está
 * marcado, PENDENTE e NA TELA: marcar, trocar o filtro e aprovar não pode levar
 * junto o que o filtro escondeu — aprovação é dinheiro liberado, e o usuário
 * aprova o que vê.
 *
 * 10/11/2026: e só o que a pessoa PODE aprovar (`pode_aprovar` da alçada por
 * usuário) — o resto o banco recusaria item a item.
 */
export function itensDoLote<T extends { id: string; approval_status: string; pode_aprovar?: boolean | null }>(naTela: T[], selecionados: Set<string>): T[] {
    return naTela.filter(i => selecionados.has(i.id) && i.approval_status === 'PENDENTE' && i.pode_aprovar !== false);
}

/**
 * Todo tipo (`entity`) que `fn_approval_action_queue` pode devolver: título, DARF,
 * planta, solicitação de compra e ofício. Fora de propósito: contrato e pedido de
 * compra (saíram da fila em 26/10/2026 — o pago são as parcelas), etapa de processo
 * e risco (filas próprias). O mapa de rótulos `ENTITY_TAG` tem todos porque é o
 * vocabulário da alçada, não o da fila.
 */
export const TIPOS_DA_FILA = ['transaction', 'darf', 'blueprint_snapshot', 'purchase_request', 'doc_gen_documento'] as const;

/**
 * Tipos oferecidos no filtro "Tipo" da fila, na ordem do mapa de rótulos. Até
 * 16/11/2026 eram só os presentes na fila — sem DARF pendente, o tipo DARF sumia
 * (o mesmo defeito do filtro Origem). Agora: o catálogo + o que vier nas linhas
 * (esquecer no catálogo não esconde) + o escolhido (para dar para trocar).
 */
export function tiposDoFiltro<T extends string>(itens: { entity: string }[], ordem: T[], escolhido: string): T[] {
    const oferecidos = new Set<string>([...TIPOS_DA_FILA, ...itens.map(i => i.entity), escolhido]);
    return ordem.filter(k => oferecidos.has(k));
}

/**
 * Rótulo da coluna/filtro "Origem" (26/10/2026 — todo título a pagar passa pela
 * fila, ~460 por mês; a origem é o que permite aprovar por blocos, ex.: a folha
 * do mês). Título usa o vocabulário de Contas a Pagar; os demais, o tipo.
 *
 * 16/11/2026: DARF e FGTS avulso são a MESMA origem, "Tributo". Desde 09/11 o
 * tributo solto não entra mais na fila (só pelo DARF enviado; FGTS segue avulso),
 * e com o DARF rotulado "DARF" a origem "Tributo" passou a cobrir só o FGTS — o
 * recorte "todos os tributos" deixou de existir. O Tipo continua dizendo "DARF".
 */
export const ORIGEM_FILA: Record<string, string> = {
    ...ORIGEM_PT,
    TRIBUTO: 'Tributo',
    DARF: 'Tributo',
    COMMERCIAL: 'Comercial',
    CONTRATO: 'Contrato',
    PEDIDO: 'Pedido de compra',
    PLANTA: 'Planta',
    SOLICITACAO_COMPRA: 'Solicitação de compra',
    OFICIO: 'Ofício',
};

export const origemDaFila = (i: { origem?: string | null }): string | null =>
    i.origem ? (ORIGEM_FILA[i.origem] ?? origemLabel(i.origem)) : null;

/**
 * Toda origem que `fn_approval_action_queue` pode devolver. Pedido de 16/11/2026:
 * *"no filtro Origem falta Tributos"* — o filtro só oferecia o que estava na fila
 * naquele momento; sem DARF pendente, "Tributo" sumia (e Folha, Obra, NF-e,
 * Planta, Ofício… pelo mesmo motivo), e não dava para conferir "há tributo para
 * aprovar?" escolhendo a origem.
 *
 * Os ramos da função:
 *   - título: `source_system` de quem passa pela alçada (`fn_titulo_nasce_na_alcada`
 *     deixa de fora ASAAS_FEE, a multa/juros do DARF e condomínio), ou TRIBUTO
 *     (FGTS avulso — tributo solto não entra);
 *   - DARF, PLANTA, SOLICITACAO_COMPRA, OFICIO.
 *
 * Esquecer uma aqui NÃO a esconde: `origensDoFiltro` soma as que vierem nas linhas
 * — a lista fixa sozinha foi o erro de Contas a Pagar até 15/08/2026 (5 de 12
 * origens filtráveis, e ninguém percebia porque a lista parecia completa).
 */
export const ORIGENS_DA_FILA = [
    'PURCHASE_ORDER', 'NFE', 'BOLETO',
    'CONTRACT_RECURRING', 'CONTRACT_PARCELADO', 'CONTRACT_AVISTA', 'CONTRACT_MEASUREMENT',
    'LABOR', 'PROLABORE', 'DIVIDENDOS', 'COMMERCIAL', 'PROJECT',
    'DEBT_INSTALLMENT', 'ASSET_MAINTENANCE', 'MANUAL',
    'TRIBUTO', 'DARF', 'PLANTA', 'SOLICITACAO_COMPRA', 'OFICIO',
] as const;

/**
 * Opções do filtro "Origem": o catálogo inteiro + o que vier na fila + o escolhido
 * (filtro persistido com rótulo antigo, ex.: "DARF", não pode deixar o `<select>`
 * mostrando "Todas" com a tabela filtrada). Por rótulo, sem repetir, em ordem alfabética.
 */
export function origensDoFiltro(itens: { origem?: string | null }[], escolhido: string): string[] {
    const rotulos = new Set<string>(ORIGENS_DA_FILA.map(o => origemDaFila({ origem: o }) as string));
    for (const i of itens) {
        const o = origemDaFila(i);
        if (o) rotulos.add(o);
    }
    if (escolhido) rotulos.add(escolhido);
    return [...rotulos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
