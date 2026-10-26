import type { ApprovalStep } from '../types/financial';

/**
 * Situação de um título a pagar na alçada — regra ÚNICA para a coluna Status de
 * Contas a Pagar, o botão de baixa/PIX e o serviço que recusa a baixa.
 *
 * Desde 26/10/2026 todo título a pagar nasce PENDENTE na alçada (gatilho
 * `fn_titulo_nasce_na_alcada`; plano docs/planos/2026-10-26-todo-titulo-a-pagar-
 * passa-pela-aprovacao.md). O usuário vê três situações para o título em aberto:
 * "Aguardando aprovação", "Liberado para pagamento" e "Bloqueado" (rejeitado).
 *
 * O vencimento NÃO some: o `effective_status` da view troca APROVADO vencido por
 * VENCIDO, e a tela precisa dos dois — por isso o atraso vira segunda linha, e é
 * lido pela DATA (o business_status antigo AGUARDANDO_APROVACAO não vira VENCIDO).
 */

export const MOTIVO_ALCADA_PENDENTE =
    'Aguardando aprovação na alçada — aprove em Financeiro › Aprovações antes de dar baixa. ' +
    'A conciliação com o extrato continua liberada.';

export const MOTIVO_ALCADA_REJEITADA =
    'Rejeitado na aprovação — reenvie para aprovação antes de pagar. ' +
    'A conciliação com o extrato continua liberada.';

/** Motivo para recusar baixa/PIX pela alçada, ou null se o título pode ser pago. */
export function motivoParaNaoPagar(approvalStatus: string | null | undefined): string | null {
    if (approvalStatus === 'PENDENTE') return MOTIVO_ALCADA_PENDENTE;
    if (approvalStatus === 'REJEITADO') return MOTIVO_ALCADA_REJEITADA;
    return null;
}

/**
 * Níveis aprovados na RODADA atual: só os passos depois da última rejeição.
 * O reenvio de um rejeitado preserva a cadeia (o histórico da rejeição fica), e
 * uma aprovação dada ANTES da rejeição não pode contar para o reenvio.
 */
export function niveisAprovadosNaRodada(cadeia: ApprovalStep[] | null | undefined): number[] {
    const passos = cadeia ?? [];
    const ultimaRejeicao = passos.map(p => p.action).lastIndexOf('REJEITADO');
    const niveis = passos.slice(ultimaRejeicao + 1).filter(p => p.action === 'APROVADO').map(p => p.level);
    return [...new Set(niveis)].sort();
}

/** Situações sem pagamento a fazer: o rótulo de sempre, sem alçada. */
const SEM_PAGAMENTO_A_FAZER = ['PAGO', 'CANCELADO', 'RETIDO'];
/** Situações de pagamento em andamento que mantêm o rótulo próprio (a alçada ainda vale para pagar). */
const ROTULO_PROPRIO = ['PARCIAL', 'RENEGOCIADO'];

export interface TituloNaAlcada {
    effective_status: string;
    approval_status?: string | null;
    approval_chain?: ApprovalStep[] | null;
    approval_required_levels?: number | null;
    due_date?: string | null;
}

export interface SituacaoTitulo {
    /** Chave do rótulo: AGUARDANDO_APROVACAO | LIBERADO_PARA_PAGAMENTO | BLOQUEADO, ou o effective_status. */
    chave: string;
    /** Segunda linha da célula (ex.: "Vencido", "Nível 1 de 2 aprovado"). */
    detalhes: string[];
    vencido: boolean;
    podePagar: boolean;
    /** Por que baixa/PIX estão desligados (null = liberado ou nada a pagar). */
    motivo: string | null;
    /** Texto da rejeição, para o title do "Bloqueado". */
    motivoRejeicao: string | null;
}

export function situacaoDoTitulo(t: TituloNaAlcada, hoje: string): SituacaoTitulo {
    const efetivo = t.effective_status;
    if (SEM_PAGAMENTO_A_FAZER.includes(efetivo)) {
        return { chave: efetivo, detalhes: [], vencido: false, podePagar: false, motivo: null, motivoRejeicao: null };
    }

    const vencido = !!t.due_date && t.due_date.slice(0, 10) < hoje;
    const aprovacao = t.approval_status ?? 'RASCUNHO';
    const cadeia = t.approval_chain ?? [];
    const motivo = motivoParaNaoPagar(aprovacao);
    const proprio = ROTULO_PROPRIO.includes(efetivo);

    const detalhes: string[] = [];
    if (vencido && !proprio && aprovacao !== 'RASCUNHO') detalhes.push('Vencido');

    if (aprovacao === 'PENDENTE') {
        const niveis = t.approval_required_levels ?? 1;
        if (niveis === 2 && niveisAprovadosNaRodada(cadeia).includes(1)) {
            detalhes.push('Nível 1 de 2 aprovado');
        }
        return { chave: proprio ? efetivo : 'AGUARDANDO_APROVACAO', detalhes, vencido, podePagar: false, motivo, motivoRejeicao: null };
    }
    if (aprovacao === 'REJEITADO') {
        const rejeicao = [...cadeia].reverse().find(s => s.action === 'REJEITADO');
        return { chave: proprio ? efetivo : 'BLOQUEADO', detalhes, vencido, podePagar: false, motivo, motivoRejeicao: rejeicao?.notes ?? null };
    }
    if (aprovacao === 'APROVADO') {
        return { chave: proprio ? efetivo : 'LIBERADO_PARA_PAGAMENTO', detalhes, vencido, podePagar: true, motivo: null, motivoRejeicao: null };
    }
    // RASCUNHO: fora da regra (linha anterior à virada ou exceção do gatilho) — status de sempre.
    return { chave: efetivo, detalhes: [], vencido, podePagar: true, motivo: null, motivoRejeicao: null };
}
