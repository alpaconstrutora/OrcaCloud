import { PillTone } from '../../portal/PortalKit';
import { ParcelaStatus, PurchaseOrder } from '../../../types';
import { totalEfetivoDoPedido } from '../../../utils/pedidoItemValor';

/**
 * Tons das pílulas do Portal do Fornecedor (vocabulário §24).
 *
 * O status vem do domínio de suprimentos (`types/supplyChain.ts`) — nada de
 * inventar rótulo aqui: só a cor muda.
 */
export const ORDER_TONE: Record<PurchaseOrder['status'], PillTone> = {
    'Rascunho': 'muted',
    'Enviado': 'info',
    'Em Negociação': 'neutral',
    'Confirmado': 'info',
    'Separação': 'neutral',
    'Em Trânsito': 'neutral',
    'Entregue': 'good',
    'Recebido': 'good',
    'Divergência': 'accent',
    'Cancelado': 'muted',
};

export const QUOTATION_TONE: Record<string, PillTone> = {
    'Aberta': 'info',
    'Em Análise': 'neutral',
    'Concluída': 'good',
    'Cancelada': 'muted',
};

export const INVOICE_STATUS: Record<string, { label: string; tone: PillTone }> = {
    pending: { label: 'Pendente', tone: 'neutral' },
    approved: { label: 'Aprovado', tone: 'info' },
    paid: { label: 'Pago', tone: 'good' },
    rejected: { label: 'Recusado', tone: 'accent' },
};

/**
 * Parcela do pedido (aba Financeiro). O status é o `effective_status` de
 * `vw_payables` — a view é a dona da regra; aqui só rótulo e cor. Record
 * TOTAL sobre `ParcelaStatus`: status novo na view quebra o typecheck aqui,
 * em vez de virar pílula sem texto.
 */
export const PAYABLE_STATUS: Record<ParcelaStatus, { label: string; tone: PillTone }> = {
    PAGO:        { label: 'Pago',        tone: 'good' },
    VENCIDO:     { label: 'Vencido',     tone: 'accent' },
    PREVISTO:    { label: 'Pendente',    tone: 'neutral' },
    APROVADO:    { label: 'Pendente',    tone: 'neutral' },
    EMITIDO:     { label: 'Pendente',    tone: 'neutral' },
    ENVIADO:     { label: 'Pendente',    tone: 'neutral' },
    PARCIAL:     { label: 'Parcial',     tone: 'info' },
    RENEGOCIADO: { label: 'Renegociado', tone: 'info' },
    CANCELADO:   { label: 'Cancelado',   tone: 'muted' },
};

/** Pedido que ainda não gerou parcela (gera na entrega, com nota vinculada). */
export const SEM_PARCELAS = { label: 'A gerar', tone: 'muted' as PillTone };

/** Soma dos itens do pedido — o total não é coluna no banco; cotado quando houver, senão referência. */
export const orderTotal = (o: PurchaseOrder): number => totalEfetivoDoPedido(o.items);

/** Pedidos que ainda estão em jogo para o fornecedor (não fechados/cancelados). */
export const isOpenOrder = (o: PurchaseOrder) =>
    !['Recebido', 'Cancelado'].includes(o.status);

/** Pedidos em mesa de negociação — é o que a aba Lances mostra. */
export const isNegotiating = (o: PurchaseOrder) =>
    o.status === 'Enviado' || o.status === 'Em Negociação';
