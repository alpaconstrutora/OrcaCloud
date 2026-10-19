/**
 * Forma de entrega de cotação e pedido (`delivery_method`, texto livre no banco).
 *
 * Só CIF e FOB: o campo responde UMA pergunta — quem paga e assume o frete.
 * Até 2026-10-19 a lista tinha também "Entrega Própria Fornecedor",
 * "Transportadora Terceirizada" e "Retirada em Mãos", que respondiam outra
 * pergunta (por qual meio a carga chega) e se sobrepunham às duas primeiras:
 * entrega própria é um CIF, retirada em mãos é um FOB, e transportadora pode ser
 * qualquer um dos dois. Nenhuma das três tinha sido gravada.
 *
 * O valor gravado é o texto inteiro da opção — é o que pedidos, cotações e o
 * portal do fornecedor já exibem.
 */
export const FORMA_ENTREGA_CIF = 'CIF - Entrega por conta do fornecedor';
export const FORMA_ENTREGA_FOB = 'FOB - Retirada por conta do comprador';

export const FORMAS_DE_ENTREGA = [FORMA_ENTREGA_CIF, FORMA_ENTREGA_FOB] as const;

/** Sem forma informada vale CIF — o padrão de todos os formulários. */
export const FORMA_ENTREGA_PADRAO: string = FORMA_ENTREGA_CIF;

/**
 * FOB = o comprador retira no fornecedor. Casa pelo prefixo para aceitar
 * variações de texto ("FOB", "fob - ...").
 */
export const ehFob = (formaEntrega?: string | null): boolean =>
    (formaEntrega ?? '').trim().toUpperCase().startsWith('FOB');

/**
 * Como o status logístico do pedido se LÊ conforme o frete.
 *
 * No FOB o fornecedor não transporta nada: separa a carga e a deixa à
 * disposição; quem busca é o comprador. Os status gravados continuam os mesmos
 * (o CHECK de `purchase_orders.status`, o botão Receber — que espera
 * 'Entregue' — e a geração do título a pagar dependem deles); muda só o nome
 * que a tela mostra:
 *
 *   'Em Trânsito' → 'Pronto para retirada'  (carga separada, aguardando o comprador)
 *   'Entregue'    → 'Retirado'              (a entrega do FOB É a retirada)
 *
 * O resto (Separação, Recebido, Divergência…) tem o mesmo sentido nos dois.
 */
export const rotuloStatusLogistico = (status: string | undefined | null, fob: boolean): string => {
    const s = status ?? '';
    if (!fob) return s;
    if (s === 'Em Trânsito') return 'Pronto para retirada';
    if (s === 'Entregue') return 'Retirado';
    return s;
};
