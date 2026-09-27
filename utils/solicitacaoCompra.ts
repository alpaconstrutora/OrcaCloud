import type {
    PurchaseRequest,
    PurchaseRequestDisplayStatus,
    PurchaseRequestDraft,
    PurchaseRequestItem,
} from '../types/purchaseRequest';
import type { PurchaseOrderItem, QuotationRequestItem } from '../types/supplyChain';

/**
 * Regras puras da Solicitação de Compra.
 * Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md
 *
 * Toda decisão de "pode / não pode" mora aqui, com o MOTIVO em texto — o botão
 * desabilitado sempre diz por quê (feedback_botao_desligado_sempre_diz_por_que).
 * A trava de edição também existe no banco (fn_purchase_requests_guard); esta é
 * a que a tela consulta para não oferecer o que o banco vai recusar.
 */

type Cabecalho = Pick<PurchaseRequest, 'approvalStatus' | 'cancelledAt'>;
type ComItens = Cabecalho & { items: PurchaseRequestItem[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function itemAtendido(item: PurchaseRequestItem): boolean {
    return !!(item.quotationRequestId || item.purchaseOrderId);
}

export function itemAtivo(item: PurchaseRequestItem): boolean {
    return !item.cancelledAt;
}

/**
 * Status exibido, em ordem de precedência:
 * cancelada > rascunho > em aprovação > reprovada > aprovada > em atendimento > atendida.
 *
 * "Atendida" = todo item ATIVO tem cotação ou pedido. Item cancelado não conta
 * (nem a favor, nem contra); SC aprovada com todos os itens cancelados e nenhum
 * atendido continua "aprovada" — cancelar a SC é decisão explícita.
 */
export function statusDaSolicitacao(sc: ComItens): PurchaseRequestDisplayStatus {
    if (sc.cancelledAt) return 'cancelada';
    switch (sc.approvalStatus) {
        case 'RASCUNHO': return 'rascunho';
        case 'PENDENTE': return 'em_aprovacao';
        case 'REJEITADO': return 'reprovada';
    }
    const ativos = sc.items.filter(itemAtivo);
    const atendidos = ativos.filter(itemAtendido).length;
    if (atendidos === 0) return 'aprovada';
    return atendidos === ativos.length ? 'atendida' : 'em_atendimento';
}

export const STATUS_LABEL: Record<PurchaseRequestDisplayStatus, string> = {
    rascunho: 'Rascunho',
    em_aprovacao: 'Em aprovação',
    reprovada: 'Reprovada',
    aprovada: 'Aprovada',
    em_atendimento: 'Em atendimento',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
};

/** Classe de TEXTO colorido (§8 do guia: status não é pílula). */
export const STATUS_TEXT_CLASS: Record<PurchaseRequestDisplayStatus, string> = {
    rascunho: 'text-gray-500 dark:text-gray-400',
    em_aprovacao: 'text-amber-600 dark:text-amber-400',
    reprovada: 'text-red-600 dark:text-red-400',
    aprovada: 'text-blue-600 dark:text-blue-400',
    em_atendimento: 'text-indigo-600 dark:text-indigo-400',
    atendida: 'text-emerald-600 dark:text-emerald-400',
    cancelada: 'text-gray-400 dark:text-gray-500',
};

/** `null` = pode. String = o motivo de não poder, pronto para a tela. */
export type Motivo = string | null;

export function motivoNaoEditar(sc: Cabecalho): Motivo {
    if (sc.cancelledAt) return 'Solicitação cancelada.';
    if (sc.approvalStatus === 'PENDENTE') return 'Em aprovação — aguarde a decisão para alterar.';
    if (sc.approvalStatus === 'APROVADO') return 'Aprovada — o conteúdo aprovado não se altera.';
    return null;
}

/** Validação do rascunho — serve para salvar E para enviar. */
export function motivoRascunhoInvalido(d: PurchaseRequestDraft): Motivo {
    if (!d.projectId) return 'Selecione a obra.';
    if (!d.title.trim()) return 'Informe o título.';
    const ativos = d.items.filter(itemAtivo);
    if (ativos.length === 0) return 'Inclua ao menos um item.';
    const semDescricao = ativos.findIndex(i => !i.description.trim());
    if (semDescricao >= 0) return `Item ${semDescricao + 1}: informe a descrição.`;
    const semQtd = ativos.findIndex(i => !(Number(i.quantity) > 0));
    if (semQtd >= 0) return `Item ${semQtd + 1}: a quantidade precisa ser maior que zero.`;
    const precoNegativo = ativos.findIndex(i => Number(i.estimatedUnitPrice) < 0);
    if (precoNegativo >= 0) return `Item ${precoNegativo + 1}: o preço estimado não pode ser negativo.`;
    return null;
}

export function motivoNaoEnviar(sc: Cabecalho, d: PurchaseRequestDraft): Motivo {
    return motivoNaoEditar(sc) ?? motivoRascunhoInvalido(d);
}

export function motivoNaoCancelar(sc: ComItens): Motivo {
    if (sc.cancelledAt) return 'Solicitação já cancelada.';
    if (statusDaSolicitacao(sc) === 'atendida') return 'Todos os itens já foram atendidos.';
    return null;
}

/** Excluir só existe para rascunho — o que entrou no fluxo se cancela (§6.3). */
export function motivoNaoExcluir(sc: Cabecalho): Motivo {
    if (sc.approvalStatus !== 'RASCUNHO') return 'Já enviada para aprovação — use Cancelar.';
    return null;
}

export function motivoNaoDecidir(sc: Cabecalho): Motivo {
    if (sc.cancelledAt) return 'Solicitação cancelada.';
    if (sc.approvalStatus !== 'PENDENTE') return 'Só se aprova ou reprova solicitação em aprovação.';
    return null;
}

/** Itens que ainda podem virar cotação/pedido. */
export function itensConvertiveis(sc: ComItens): PurchaseRequestItem[] {
    if (sc.cancelledAt || sc.approvalStatus !== 'APROVADO') return [];
    return sc.items.filter(i => itemAtivo(i) && !itemAtendido(i));
}

export function motivoNaoConverter(sc: ComItens, selecionados: PurchaseRequestItem[]): Motivo {
    if (sc.cancelledAt) return 'Solicitação cancelada.';
    if (sc.approvalStatus !== 'APROVADO') return 'Só solicitação aprovada vira cotação ou pedido.';
    if (itensConvertiveis(sc).length === 0) return 'Todos os itens já foram atendidos.';
    if (selecionados.length === 0) return 'Marque os itens a atender.';
    const invalido = selecionados.find(i => !itemAtivo(i) || itemAtendido(i));
    if (invalido) return `"${invalido.description}" já foi atendido ou cancelado.`;
    return null;
}

export function totalDoItem(i: Pick<PurchaseRequestItem, 'quantity' | 'estimatedUnitPrice'>): number {
    return round2((Number(i.quantity) || 0) * (Number(i.estimatedUnitPrice) || 0));
}

/** Σ dos itens ativos — é o valor que resolve a faixa da alçada. */
export function totalEstimado(items: PurchaseRequestItem[]): number {
    return round2(items.filter(itemAtivo).reduce((s, i) => s + totalDoItem(i), 0));
}

export function itensParaCotacao(items: PurchaseRequestItem[]): QuotationRequestItem[] {
    return items.map(i => ({
        code: i.inputCode ?? '',
        description: i.description,
        unit: i.unit,
        quantity: Number(i.quantity),
        unitPrice: Number(i.estimatedUnitPrice) || 0,
    }));
}

/** Preço estimado entra como REFERÊNCIA (unitPrice/total); o cotado fica vazio. */
export function itensParaPedido(items: PurchaseRequestItem[]): PurchaseOrderItem[] {
    return items.map(i => ({
        code: i.inputCode ?? '',
        description: i.description,
        unit: i.unit,
        quantity: Number(i.quantity),
        unitPrice: Number(i.estimatedUnitPrice) || 0,
        total: totalDoItem(i),
    }));
}

/** Situação de um item, em texto, para a coluna "Atendimento". */
export function situacaoDoItem(i: PurchaseRequestItem): string {
    if (i.cancelledAt) return 'Cancelado';
    if (i.purchaseOrderId) return `Pedido ${i.purchaseOrderNumber ?? ''}`.trim();
    if (i.quotationRequestId) return `Cotação ${i.quotationNumber ?? ''}`.trim();
    return 'Pendente';
}

export const ORIGEM_LABEL: Record<PurchaseRequestItem['source'], string> = {
    orcamento: 'Orçamento',
    avulso: 'Avulso',
    almoxarifado: 'Almoxarifado',
    plano: 'Plano de Aquisições',
};
