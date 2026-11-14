// Pagamento de boleto pela Asaas — regras puras (Deno + Vitest, SEM imports).
//
// Plano: docs/planos/2026-11-13-asaas-boleto-data-e-cancelamento.md.

/**
 * Data do pagamento enviada à Asaas (`scheduleDate`).
 *
 * Medido em 13/11/2026: sem `scheduleDate`, a Asaas AGENDA para o vencimento (4 boletos de
 * vencimento 30/11 ficaram com scheduleDate 30/11) — a doc diz "imediato", o comportamento é
 * outro. Por isso a data vai sempre explícita: a escolhida, ou a data mínima da simulação
 * ("o quanto antes"), ou hoje. Conta VENCIDA não leva data: a Asaas recusa agendar vencida e a
 * processa como pagamento imediato.
 */
export function dataDoPagamentoDeBoleto(p: {
    hoje: string;
    vencimento: string | null | undefined;
    escolhida?: string | null;
    dataMinima?: string | null;
}): { scheduleDate: string | null; agendado: boolean; erro?: string } {
    const vencida = !!p.vencimento && p.vencimento < p.hoje;
    if (vencida) return { scheduleDate: null, agendado: false };
    const data = p.escolhida || p.dataMinima || p.hoje;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { scheduleDate: null, agendado: false, erro: 'Data do pagamento inválida.' };
    if (data < p.hoje) return { scheduleDate: null, agendado: false, erro: 'A data do pagamento não pode ser no passado.' };
    if (p.dataMinima && data < p.dataMinima) {
        return { scheduleDate: null, agendado: false, erro: `A Asaas só aceita pagar a partir de ${br(p.dataMinima)}.` };
    }
    if (p.vencimento && data > p.vencimento) {
        return { scheduleDate: null, agendado: false, erro: `A data do pagamento não pode passar do vencimento (${br(p.vencimento)}).` };
    }
    return { scheduleDate: data, agendado: data > p.hoje };
}

/**
 * O cancelamento pedido à Asaas JÁ aconteceu? Só se a resposta diz CANCELLED (ou o pagamento
 * não existe mais, 404). Quando a Asaas exige autorização (token SMS/app), a resposta não traz
 * CANCELLED: o pedido fica aguardando, e o status muda pelo aviso da Asaas ou pela consulta
 * automática. Antes (até 13/11/2026), qualquer 2xx virava "cancelado" no OrçaCloud.
 */
export function cancelamentoConfirmado(httpStatus: number, corpo: unknown): boolean {
    if (httpStatus === 404) return true;
    const status = (corpo as { status?: unknown } | null)?.status;
    return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

function br(iso: string): string {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
}

/**
 * Antes de pedir o cancelamento, o estado ATUAL na Asaas decide (doc "Cancelar pagamento de
 * contas": "Antes de solicitar o cancelamento, consulte o pagamento e valide `canBeCancelled`" —
 * conferida em 14/11/2026). Evita disparar um pedido que a Asaas vai recusar — e o SMS à toa.
 * - `ja_cancelado`: a Asaas já cancelou (ex.: autorizado pelo app e o aviso ainda não chegou);
 * - `nao_cancelavel`: `canBeCancelled` falso — volta o motivo legível;
 * - `pedir`: pode pedir (ou a consulta não disse nada: o pedido segue como antes).
 */
export function decisaoDoCancelamento(atual: { status?: unknown; canBeCancelled?: unknown } | null):
    | { acao: 'pedir' }
    | { acao: 'ja_cancelado' }
    | { acao: 'nao_cancelavel'; motivo: string } {
    if (!atual) return { acao: 'pedir' };
    const status = typeof atual.status === 'string' ? atual.status.toUpperCase() : '';
    if (status === 'CANCELLED') return { acao: 'ja_cancelado' };
    if (atual.canBeCancelled !== false) return { acao: 'pedir' };
    const motivo =
        status === 'BANK_PROCESSING' ? 'Já está em processamento no banco — a Asaas não cancela mais.'
        : status === 'PAID' || status === 'DONE' ? 'Já foi pago — não há o que cancelar.'
        : status === 'FAILED' ? 'O pagamento falhou na Asaas — não há o que cancelar.'
        : status === 'REFUNDED' ? 'O pagamento foi estornado — não há o que cancelar.'
        : `A Asaas informa que este pagamento não pode mais ser cancelado${status ? ` (status ${status})` : ''}.`;
    return { acao: 'nao_cancelavel', motivo };
}
