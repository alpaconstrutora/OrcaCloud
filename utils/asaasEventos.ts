// Regras puras dos eventos da Asaas — SEM imports, de propósito.
//
// O mesmo arquivo é carregado pela Edge Function (`asaas-webhook`,
// `asaas-status-sync`, via `_shared/asaasProcessar.ts`), pelo navegador
// (`clientChargeService`) e pelo Vitest. É o padrão de
// `utils/reconciliationRules.ts`: decisão aqui, gravação lá.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 1).

// ─── Vocabulário da Asaas ───────────────────────────────────────────────

/** Status de cobrança (payment.status) que significam "dinheiro recebido". */
export const STATUS_COBRANCA_PAGA = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'] as const;

/**
 * Status locais de cobrança que NÃO contam como ativa. `CANCELLED` é o nosso
 * (ação cancel); `DELETED` e `REFUNDED` vêm do webhook.
 */
export const STATUS_COBRANCA_ENCERRADA = ['CANCELLED', 'DELETED', 'REFUNDED'] as const;

const EVENTOS_COBRANCA_PAGA = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const EVENTOS_COBRANCA_DESFEITA = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_DELETED'];

/** Status de `supplier_payments` dos quais não se sai (exceto estorno de DONE). */
export const STATUS_SAIDA_TERMINAL = ['DONE', 'FAILED', 'CANCELLED'] as const;

/**
 * Status de `supplier_payments` que ocupam o título/boleto: enquanto houver um
 * desses, não se dispara outro pagamento. `APPROVED` entra porque é o estado
 * gravado ANTES de chamar a Asaas — se a função cair no meio, a linha fica aí
 * até alguém cancelar, e cancelar sem `asaas_*_id` só muda o status local.
 */
export const STATUS_SAIDA_OCUPANDO = ['APPROVED', 'PENDING', 'SCHEDULED', 'DONE'] as const;

// ─── Payload ────────────────────────────────────────────────────────────

export interface PayloadAsaas {
    event?: string;
    payment?: {
        id?: string;
        status?: string;
        paymentDate?: string | null;
        clientPaymentDate?: string | null;
        confirmedDate?: string | null;
        value?: number;
        netValue?: number;
        deleted?: boolean;
    };
    bill?: {
        id?: string;
        status?: string;
        value?: number;
        fee?: number;
        paymentDate?: string | null;
        scheduleDate?: string | null;
        transactionReceiptUrl?: string | null;
        failReasons?: unknown;
    };
    transfer?: {
        id?: string;
        status?: string;
        value?: number;
        netValue?: number;
        transferFee?: number;
        effectiveDate?: string | null;
        scheduleDate?: string | null;
        transactionReceiptUrl?: string | null;
        failReason?: string | null;
        authorized?: boolean;
    };
}

export type Ramo = 'bill' | 'transfer' | 'payment' | 'desconhecido';

/**
 * Qual parte do sistema o evento toca. Antes, todo payload sem `payment.id`
 * caía num `400 Payload inválido` — inclusive `TRANSFER_*` e eventos de conta.
 * A Asaas trata 4xx como falha e REENVIA, e depois de várias falhas pausa a
 * fila de webhooks da conta inteira. Evento que não é nosso responde 200.
 */
export function ramoDoEvento(p: PayloadAsaas | null | undefined): Ramo {
    const ev = p?.event ?? '';
    if (ev.startsWith('BILL_') && p?.bill?.id) return 'bill';
    if (ev.startsWith('TRANSFER_') && p?.transfer?.id) return 'transfer';
    if (ev.startsWith('PAYMENT_') && p?.payment?.id) return 'payment';
    return 'desconhecido';
}

/** 'AAAA-MM-DD' de uma data ISO ou já curta; null se vazia/inválida. */
export function soData(valor: string | null | undefined): string | null {
    if (!valor) return null;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
    return m ? m[1] : null;
}

/**
 * Data em que o dinheiro efetivamente se moveu, segundo a Asaas. Antes o
 * webhook gravava o dia em que o EVENTO chegou — retry de madrugada ou
 * fallback por polling jogavam a baixa no dia (e às vezes no mês) errado.
 * `hoje` só quando a Asaas não manda data nenhuma.
 */
export function dataDoMovimento(p: PayloadAsaas, hoje: string): string {
    const r = ramoDoEvento(p);
    let d: string | null = null;
    if (r === 'payment') {
        d = soData(p.payment?.paymentDate) ?? soData(p.payment?.clientPaymentDate) ?? soData(p.payment?.confirmedDate);
    } else if (r === 'bill') {
        d = soData(p.bill?.paymentDate);
    } else if (r === 'transfer') {
        d = soData(p.transfer?.effectiveDate);
    }
    return d ?? hoje;
}

/** Taxa cobrada pela Asaas numa cobrança: bruto − líquido, em centavos inteiros. */
export function taxaDaCobranca(valor: number | null | undefined, liquido: number | null | undefined): number {
    const bruto = Number(valor ?? 0);
    const net = liquido == null ? bruto : Number(liquido);
    const fee = Math.round((bruto - net) * 100) / 100;
    return fee > 0 ? fee : 0;
}

export function cobrancaAtiva(status: string | null | undefined): boolean {
    return !(STATUS_COBRANCA_ENCERRADA as readonly string[]).includes(String(status ?? ''));
}

export function cobrancaPaga(status: string | null | undefined): boolean {
    return (STATUS_COBRANCA_PAGA as readonly string[]).includes(String(status ?? ''));
}

// ─── Cobrança ao cliente (client_charges) ───────────────────────────────

export type AcaoCobranca =
    | 'baixar'          // recebido: baixa o recebível + lança taxa
    | 'estornar'        // estava pago e foi desfeito: recebível volta, taxa cancelada
    | 'cancelar'        // cobrança removida/estornada antes de pagar: recebível EMITIDO → PREVISTO
    | 'refletir'        // só copia o status (OVERDUE, RESTORED, …)
    | 'ignorar';        // idempotência: já está no estado de destino

export function decidirCobranca(evento: string, statusAtual: string | null | undefined): AcaoCobranca {
    const atual = String(statusAtual ?? '');
    if (EVENTOS_COBRANCA_PAGA.includes(evento)) {
        return cobrancaPaga(atual) ? 'ignorar' : 'baixar';
    }
    if (EVENTOS_COBRANCA_DESFEITA.includes(evento)) {
        if (cobrancaPaga(atual)) return 'estornar';
        if ((STATUS_COBRANCA_ENCERRADA as readonly string[]).includes(atual)) return 'ignorar';
        return 'cancelar';
    }
    return 'refletir';
}

/**
 * Status local gravado em `client_charges` para um evento de desfazimento.
 * O `payment.status` de uma cobrança REMOVIDA continua "PENDING" no payload
 * (a Asaas marca `deleted: true` à parte) — copiar o status deixava a
 * cobrança apagada parecendo viva.
 */
export function statusLocalDoDesfazimento(evento: string, statusAsaas: string | null | undefined): string {
    if (evento === 'PAYMENT_DELETED') return 'DELETED';
    if (evento === 'PAYMENT_REFUNDED') return 'REFUNDED';
    return String(statusAsaas || 'CANCELLED');
}

// ─── Saída: boleto de terceiro (BILL) e transferência PIX (TRANSFER) ────

export type AcaoSaida =
    | 'concluir'        // pago: título PAGO + taxa
    | 'falhar'          // não pagou: FAILED, título/boleto liberados
    | 'cancelar'        // cancelado antes de pagar: CANCELLED, liberados
    | 'estornar'        // estava DONE e o dinheiro voltou: título volta a APROVADO, taxa cancelada
    | 'acompanhar'      // estado intermediário: só registra o status da Asaas
    | 'ignorar';        // idempotência

const EVENTOS_SAIDA: Record<'bill' | 'transfer', {
    concluir: string[]; falhar: string[]; cancelar: string[]; estornar: string[];
}> = {
    bill: {
        concluir: ['BILL_PAID'],
        falhar:   ['BILL_FAILED'],
        cancelar: ['BILL_CANCELLED'],
        estornar: ['BILL_REFUNDED'],
    },
    transfer: {
        concluir: ['TRANSFER_DONE'],
        falhar:   ['TRANSFER_FAILED', 'TRANSFER_BLOCKED'],
        cancelar: ['TRANSFER_CANCELLED'],
        estornar: [],
    },
};

export function decidirSaida(tipo: 'bill' | 'transfer', evento: string, statusAtual: string | null | undefined): AcaoSaida {
    const atual = String(statusAtual ?? '');
    const terminal = (STATUS_SAIDA_TERMINAL as readonly string[]).includes(atual);
    const ev = EVENTOS_SAIDA[tipo];

    if (ev.concluir.includes(evento)) return terminal ? 'ignorar' : 'concluir';

    if (ev.estornar.includes(evento)) {
        // BILL_REFUNDED depois de DONE era descartado como "already_processed":
        // o título ficava PAGO com o dinheiro de volta na conta.
        if (atual === 'DONE') return 'estornar';
        return terminal ? 'ignorar' : 'falhar';
    }

    if (ev.falhar.includes(evento) || ev.cancelar.includes(evento)) {
        // Falha DEPOIS de concluído = dinheiro devolvido (transferência
        // recusada pelo banco de destino após DONE).
        if (atual === 'DONE') return 'estornar';
        if (terminal) return 'ignorar';
        return ev.cancelar.includes(evento) ? 'cancelar' : 'falhar';
    }

    return terminal ? 'ignorar' : 'acompanhar';
}

// ─── Polling de fallback (asaas-status-sync) ────────────────────────────

/**
 * Converte o status atual de um objeto consultado na Asaas no evento que o
 * webhook teria mandado. Assim o polling reaproveita o MESMO processamento
 * do webhook, sem segundo caminho de gravação. `null` = nada a fazer ainda.
 */
export function eventoDoStatus(
    tipo: 'bill' | 'transfer' | 'payment',
    status: string | null | undefined,
    removido = false,
): string | null {
    const s = String(status ?? '').toUpperCase();
    if (tipo === 'payment') {
        if (removido) return 'PAYMENT_DELETED';
        if (s === 'RECEIVED') return 'PAYMENT_RECEIVED';
        if (s === 'CONFIRMED') return 'PAYMENT_CONFIRMED';
        if (s === 'RECEIVED_IN_CASH') return 'PAYMENT_RECEIVED_IN_CASH';
        if (s === 'REFUNDED') return 'PAYMENT_REFUNDED';
        // Chargeback pedido ou em disputa desfaz a baixa (o webhook passou a depender
        // do status real — item 5 da segurança, 18/10/2026).
        if (s === 'CHARGEBACK_REQUESTED' || s === 'CHARGEBACK_DISPUTE') return 'PAYMENT_CHARGEBACK_REQUESTED';
        if (s === 'OVERDUE') return 'PAYMENT_OVERDUE';
        return null;
    }
    if (tipo === 'bill') {
        if (s === 'PAID') return 'BILL_PAID';
        if (s === 'FAILED') return 'BILL_FAILED';
        if (s === 'CANCELLED') return 'BILL_CANCELLED';
        if (s === 'REFUNDED') return 'BILL_REFUNDED';
        return null;
    }
    if (s === 'DONE') return 'TRANSFER_DONE';
    if (s === 'FAILED') return 'TRANSFER_FAILED';
    if (s === 'CANCELLED') return 'TRANSFER_CANCELLED';
    if (s === 'BLOCKED') return 'TRANSFER_BLOCKED';
    return null;
}

/** Motivo legível de falha a partir do que a Asaas manda (string, lista ou objeto). */
export function motivoDaFalha(evento: string, p: PayloadAsaas): string {
    const t = p.transfer?.failReason;
    if (t) return String(t);
    const b = p.bill?.failReasons;
    if (Array.isArray(b) && b.length) {
        return b.map(x => (typeof x === 'string' ? x : (x as { description?: string })?.description ?? JSON.stringify(x))).join('; ');
    }
    if (typeof b === 'string' && b) return b;
    // A Asaas costuma não mandar texto no cancelamento/bloqueio: o histórico e
    // a tela mostravam o código cru (`TRANSFER_CANCELLED`).
    return MOTIVO_PADRAO[evento] ?? evento;
}

const MOTIVO_PADRAO: Record<string, string> = {
    TRANSFER_CANCELLED: 'Cancelado na Asaas',
    BILL_CANCELLED: 'Cancelado na Asaas',
    TRANSFER_BLOCKED: 'Transferência bloqueada pela Asaas',
    TRANSFER_FAILED: 'Transferência recusada (a Asaas não informou o motivo)',
    BILL_FAILED: 'Pagamento do boleto falhou (a Asaas não informou o motivo)',
    BILL_REFUNDED: 'Pagamento do boleto estornado pela Asaas',
};
