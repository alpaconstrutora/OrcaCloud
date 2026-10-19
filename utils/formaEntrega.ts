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
 * FOB = o comprador retira no fornecedor — e cuida sozinho do rastreamento. Casa pelo prefixo para aceitar
 * variações de texto ("FOB", "fob - ...").
 */
export const ehFob = (formaEntrega?: string | null): boolean =>
    (formaEntrega ?? '').trim().toUpperCase().startsWith('FOB');

/**
 * Como o status logístico do pedido se LÊ conforme o frete.
 *
 * No FOB a logística é TODA do comprador: o fornecedor aceita o pedido e não
 * tem mais ação no rastreamento (pedido do usuário em 2026-10-19 — antes o
 * pedido FOB ficava parado esperando o fornecedor marcar Separação/Em
 * Trânsito/Entregue). Quem registra a retirada é o comprador.
 *
 * Os status gravados continuam os mesmos (o CHECK de `purchase_orders.status`,
 * o botão Receber — que espera 'Entregue' — e a geração do título a pagar
 * dependem deles); muda só o nome que a tela mostra:
 *
 *   'Separação' / 'Em Trânsito' → 'Aguardando retirada'  (só pedidos antigos,
 *                                  marcados pelo fornecedor antes desta regra)
 *   'Entregue'                  → 'Retirado'  (a entrega do FOB É a retirada)
 *
 * O resto (Confirmado, Recebido, Divergência…) tem o mesmo sentido nos dois.
 */
export const rotuloStatusLogistico = (status: string | undefined | null, fob: boolean): string => {
    const s = status ?? '';
    if (!fob) return s;
    if (s === 'Separação' || s === 'Em Trânsito') return 'Aguardando retirada';
    if (s === 'Entregue') return 'Retirado';
    return s;
};

/**
 * Status em que o comprador pode registrar a retirada de um pedido FOB. Inclui
 * 'Enviado': na compra FOB o comprador muitas vezes vai ao balcão antes de o
 * fornecedor aceitar pelo portal — buscar a mercadoria já é o aceite.
 */
const STATUS_QUE_ACEITAM_RETIRADA = ['Enviado', 'Confirmado', 'Separação', 'Em Trânsito'];

/**
 * Pode registrar a retirada? Quando não pode e o botão aparece, `motivo` diz
 * por quê (botão desabilitado sempre explica). `motivo` vazio + `pode` falso =
 * o botão nem deve aparecer (pedido já retirado, recebido ou cancelado).
 */
export const situacaoDaRetirada = (status: string | undefined | null): { pode: boolean; motivo: string } => {
    const s = status ?? '';
    if (STATUS_QUE_ACEITAM_RETIRADA.includes(s)) return { pode: true, motivo: '' };
    if (s === 'Rascunho') return { pode: false, motivo: 'Envie o pedido ao fornecedor antes de registrar a retirada.' };
    if (s === 'Em Negociação') return { pode: false, motivo: 'Conclua a negociação antes de registrar a retirada.' };
    return { pode: false, motivo: '' };
};
