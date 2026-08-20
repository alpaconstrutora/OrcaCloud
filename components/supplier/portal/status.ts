import { PillTone } from '../../portal/PortalKit';
import { PurchaseOrder } from '../../../types';

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

/** Soma dos itens do pedido — o total não é coluna no banco. */
export const orderTotal = (o: PurchaseOrder): number =>
    o.items?.reduce((sum, item) => sum + (item.total || 0), 0) ?? 0;

/** Pedidos que ainda estão em jogo para o fornecedor (não fechados/cancelados). */
export const isOpenOrder = (o: PurchaseOrder) =>
    !['Recebido', 'Cancelado'].includes(o.status);

/** Pedidos em mesa de negociação — é o que a aba Lances mostra. */
export const isNegotiating = (o: PurchaseOrder) =>
    o.status === 'Enviado' || o.status === 'Em Negociação';
