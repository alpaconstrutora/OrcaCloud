/**
 * Situação de locação de uma unidade no Credit Room, pela ETAPA DA NEGOCIAÇÃO
 * (Comercial › Locações › Gerenciar Negociação › Contrato › "Etapa da Negociação",
 * `commercial_deals.status`) — decisão do usuário em 23/11/2026.
 *
 *  - Negociação de locação em "Alugado" (`COMPLETED`)         → LOCADA
 *  - Em Reserva, Contrato ou Assinatura                      → EM_NEGOCIACAO (nem locada, nem disponível)
 *  - Sem negociação que decida (nenhuma, só Proposta/Aprovação, ou cancelada):
 *    vale o status da unidade, como antes — `rental_status = 'LOCADO'` → LOCADA;
 *    `status = 'DISPONIVEL'` → DISPONIVEL; o resto (vendida, permutada…) → OUTRA.
 *
 * Por que o fallback: há unidades marcadas Locado sem negociação no sistema (cadastro
 * anterior ao fluxo); ignorá-lo tiraria aluguel real da conta.
 *
 * Puro: o service lê as negociações e entrega a etapa aqui.
 */
import { getDealStatusDisplay, getStepIndex, type DealWorkflowStatus } from '../lib/dealWorkflow';

export type SituacaoLocacao = 'LOCADA' | 'EM_NEGOCIACAO' | 'DISPONIVEL' | 'OUTRA';

/** Etapas em que a unidade está comprometida, mas ainda não alugada. `WAITING_PAYMENT` é a Reserva legada. */
export const ETAPAS_EM_NEGOCIACAO: ReadonlySet<string> = new Set(['RESERVA', 'WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA']);

/**
 * A etapa mais avançada entre as negociações de locação do imóvel. Cancelada e etapa
 * desconhecida não contam; sem nenhuma que conte, `null`.
 */
export function etapaMaisAvancada(etapas: (string | null | undefined)[]): string | null {
    let melhor: string | null = null;
    let indice = -1;
    for (const e of etapas) {
        if (!e || e === 'CANCELLED') continue;
        const i = getStepIndex(e as DealWorkflowStatus);
        if (i > indice) { indice = i; melhor = e; }
    }
    return melhor;
}

export function situacaoDeLocacao(u: { status: string; rental_status: string | null; etapa_locacao: string | null }): SituacaoLocacao {
    if (u.etapa_locacao === 'COMPLETED') return 'LOCADA';
    if (u.etapa_locacao && ETAPAS_EM_NEGOCIACAO.has(u.etapa_locacao)) return 'EM_NEGOCIACAO';
    if (u.rental_status === 'LOCADO') return 'LOCADA';
    if (u.status === 'DISPONIVEL') return 'DISPONIVEL';
    return 'OUTRA';
}

/** Rótulo da etapa de LOCAÇÃO, o mesmo do stepper (Reserva · Contrato · Assinatura · Alugado…). */
export const rotuloDaEtapaDeLocacao = (etapa: string): string => getDealStatusDisplay(etapa, 'RENTAL').label;
